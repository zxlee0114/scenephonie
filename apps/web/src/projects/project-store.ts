import { and, desc, eq, isNull, max, sql } from "drizzle-orm";

import { mintId, plainTextExcerpt } from "@scenephonie/schema";

import {
  authorizeProjectForUser,
  authorizeScreenplayForUser,
  type AuthorizedProject,
  type AuthorizedScreenplay,
} from "@/authorization";
import { getDb, type Db } from "@/db/client";
import { documents, projects, screenplays, users } from "@/db/schema";
import { emptyScreenplay } from "@/editor/empty-screenplay";
import { createFixedDocument, createScreenplay, type PersistedDoc } from "@/persistence";

/**
 * 專案這一層的存取（§4.2）。
 *
 * 讀取一律以 `ownerId` 為條件、寫入一律經過已授權的 handle。這個模組沒有第二條路可以
 * 拿到別人的專案，所以「這是誰的」不必在每個呼叫端重問一次。
 */

export const PROJECT_ID_PREFIX = "pj_";

/**
 * v1 唯一的專案類型。**不提供選擇、不做 UI** —— 只有一種類型時給選就是說謊（§4.2）。
 *
 * 1:1（一個專案一個劇本）**是這個類型的定義，不是待放寬的限制**：升級路徑是新增一種類型
 * （系列劇本專案），不是把 1:1 鬆綁成 1:N。所以下面建立專案時一定連著建立那一份劇本。
 */
export const SINGLE_SCREENPLAY_PROJECT = "單一劇本專案";

const DEFAULT_PROJECT_TITLE = "未命名專案";

/**
 * 一個專案被開出來時，裡面放什麼。
 *
 * **這是入口點的決定，不是 domain 的分支**（票券 07）：訪客從範例稿開始 —— `landingProject()`
 * 只是把呼叫端給的開場內容放進去，不問「你是誰」。domain 因此不知道有訪客這回事（ADR-0011 §③）。
 *
 * `screenplay` 是**函式**不是值：每一份開場稿都要現鑄（`sceneId` 不能兩份共用），
 * 而一個 module-level 常數會讓所有人拿到同一組 id。
 *
 * 它吃一個 **`AuthorizedProject`** 且可以是非同步的，因為開場稿可能需要先在這個專案底下
 * 建立東西（範例稿的人物與地點）—— 那正是「先建立實體、再寫入 doc」（不變式 ⑧）。
 * 專案這一層不知道它建了什麼，只知道要先有專案才輪得到它。
 */
export type ProjectOpening = {
  title: string;
  screenplay: (project: AuthorizedProject) => Promise<Record<string, unknown>>;
};

/** 沒特別說的話就是這個：空白的專案、一場空戲。 */
const BLANK_OPENING: ProjectOpening = {
  title: DEFAULT_PROJECT_TITLE,
  screenplay: async () => emptyScreenplay(),
};

export type ProjectSummary = {
  projectId: string;
  /** 專案名稱。 */
  title: string;
  /** 劇本名稱 —— 卡片上只在跟專案名稱不同時才印。 */
  screenplayTitle: string;
  /** 這個專案底下劇本與（沒刪的）文件最後一次存檔的時刻。 */
  lastEditedAt: Date;
};

/**
 * 這個人的專案（專案儀表板，票券 71），**最近編輯的在前**。
 *
 * 「最後編輯」是**查詢時算出來的**：劇本與沒刪的文件 `updated_at` 的最大值。`projects` 不另存一欄 ——
 * 沒有任何一條路會更新 `projects.updated_at`，另存一欄就得每一條存檔路都順手往上寫，漏一條就悄悄錯；
 * 算出來的不會錯，而 v1 一個人的專案數量很少。改專案名稱不算編輯：卡片回答的是「我最近在寫哪一部」。
 *
 * 刪掉的自由文件不算 —— 它已經不在了，它的時間不該把專案頂到前面。
 */
export async function ownedProjects(ownerId: string): Promise<ProjectSummary[]> {
  const scriptEdited = getDb()
    .select({ edited: max(screenplays.updatedAt) })
    .from(screenplays)
    .where(eq(screenplays.projectId, projects.id));
  const documentEdited = getDb()
    .select({ edited: max(documents.updatedAt) })
    .from(documents)
    .where(and(eq(documents.projectId, projects.id), isNull(documents.deletedAt)));
  const lastEditedAt = sql<Date>`greatest((${scriptEdited}), (${documentEdited}), ${projects.createdAt})`.mapWith(
    projects.createdAt,
  );

  return getDb()
    .select({
      projectId: projects.id,
      title: projects.title,
      // 沒有劇本的專案（`landingProject` 兩段之間斷線留下的）也要列 —— 藏起來就再也找不到它。
      screenplayTitle: sql<string>`coalesce(${screenplays.title}, ${projects.title})`,
      lastEditedAt,
    })
    .from(projects)
    .leftJoin(screenplays, eq(screenplays.projectId, projects.id))
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(lastEditedAt), desc(projects.createdAt));
}

export type ProjectContents = {
  /** 專案名稱。 */
  title: string;
  /** 劇本名稱（票券 71）—— 與專案名稱是兩個值。沒有劇本時是 `null`。 */
  screenplayTitle: string | null;
  /** 單一劇本專案之下**只有一份**（1:1 是這個 type 的定義，不是巧合）。 */
  screenplayId: string | null;
  /** 那份劇本最後一次存檔的時刻（hub 卡片上的「最後編輯」）。 */
  screenplayUpdatedAt: Date | null;
  /** 劇本開頭幾個字（hub 卡片的預覽）。 */
  screenplayExcerpt: string;
};

/** 專案 hub 要顯示的東西。只吃 handle —— 到得了這裡就代表已經授權過。 */
export async function projectContents(project: AuthorizedProject): Promise<ProjectContents> {
  const db = getDb();
  const [[row], [script]] = await Promise.all([
    db.select({ title: projects.title }).from(projects).where(eq(projects.id, project.projectId)),
    db
      .select({ id: screenplays.id, title: screenplays.title, updatedAt: screenplays.updatedAt, doc: screenplays.doc })
      .from(screenplays)
      .where(eq(screenplays.projectId, project.projectId))
      .orderBy(screenplays.createdAt)
      .limit(1),
  ]);

  return {
    title: row?.title ?? DEFAULT_PROJECT_TITLE,
    screenplayTitle: script?.title ?? null,
    screenplayId: script?.id ?? null,
    screenplayUpdatedAt: script?.updatedAt ?? null,
    screenplayExcerpt: plainTextExcerpt(script?.doc, 80),
  };
}

/** 劇本名稱（PDF 檔名用 —— 交出去的是劇本，不是「某某計畫」，票券 71）。 */
export async function screenplayTitle(screenplay: AuthorizedScreenplay): Promise<string> {
  const [row] = await getDb()
    .select({ title: screenplays.title })
    .from(screenplays)
    .where(eq(screenplays.id, screenplay.screenplayId));
  return row?.title ?? DEFAULT_PROJECT_TITLE;
}

/**
 * 訪客入口的落點：最近建立的那一個專案，一個都沒有就開一個（連同它那一份劇本）。
 *
 * 票券 71 之後**只剩訪客入口走這裡**：Google 登入落在專案儀表板，專案由建立精靈明確建立
 * （`createProject`）。訪客「一進來就有範例稿可以看」是產品決定，不是資料模型的讓步 ——
 * 專案與劇本都是正常建立的，沒有任何欄位為它特別開洞；劇本名稱就是專案名稱。
 *
 * ⚠️ **它必須冪等。** 第一次進來時的重試或兩個分頁
 * 會同時走到這裡，而 v1 沒有刪專案這件事 —— 清不掉的東西不能靠「應該不會同時發生」來防。
 * 序列化點取 `users` 的那一列：它是「這個人有沒有專案」的自然歸屬，而且第一次登入時
 * `projects` 還沒有任何一列可以鎖。
 *
 * 建完之後**回頭走一次 gate 才拿到 handle**，而不是就地捏一個。多一次 SELECT，換到的是
 * 「handle 永遠來自資料庫裡的 `owner_id`」這件事沒有例外 —— 有例外的規則等於沒有規則。
 *
 * `opening` 只在**真的開一個新專案**時用得到：已經有專案的人（含第二次進來的訪客）拿回的是
 * 他原本那一個，開場內容早就不是問題了。
 */
export async function landingProject(
  ownerId: string,
  opening: ProjectOpening = BLANK_OPENING,
): Promise<AuthorizedProject> {
  const projectId = await getDb().transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for("update");

    const [existing] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.ownerId, ownerId))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    if (existing) return existing.id;

    const id = mintId(PROJECT_ID_PREFIX);
    await tx
      .insert(projects)
      .values({ id, type: SINGLE_SCREENPLAY_PROJECT, title: opening.title, ownerId });
    return id;
  });

  const project = await authorizeProjectForUser(ownerId, projectId);
  if (!project) throw new Error("剛建立的專案卻過不了 gate —— 這代表寫入沒有落地");

  // 劇本進不去上面那個交易：`screenplays` 的 FK 指著 `projects`，專案得先 commit 才輪得到它。
  // 分兩步的代價是中間斷線會留下一個沒有劇本的專案，補法就是下一次進來時這一段。
  //
  // ⚠️ **但這一段跟上面一樣要序列化。** 兩個分頁同時第一次登入時，上面的鎖只保證兩邊拿到
  // 同一個專案 —— 接著兩邊都會看到它還沒有劇本，於是各建一份（CI 2026-09-10 抓到的真 flake：
  // 「expected 1 but got 2」）。序列化點取同一列（`users`），鎖內重查一次才建：晚到的那個
  // 這時已經看得到第一份。開場內容也在鎖內鑄 —— 它會先建立實體（不變式 ⑧），鑄兩次就留下
  // 兩組沒人引用的實體。這比第一段交易長，但它擋住的只有同一個人自己的並行登入。
  await getDb().transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for("update");

    const [script] = await tx
      .select({ id: screenplays.id })
      .from(screenplays)
      .where(eq(screenplays.projectId, project.projectId))
      .limit(1);
    if (script) return;

    // 這條路的專案只有一個名字可用：劇本名稱就是專案名稱。
    await createScreenplay(project, await opening.screenplay(project), { title: opening.title, db: tx });
  });

  return project;
}

/** 建立精靈走完時交上來的東西（票券 71）。 */
export type ProjectDraft = {
  /** client 鑄的冪等鍵：同一次建立送兩次只建一個。 */
  creationId: string;
  projectTitle: string;
  screenplayTitle: string;
  /** 故事大綱（交件大綱）的內文；沒寫就是一個空段落。 */
  submissionOutline: PersistedDoc;
  /** 分場大綱的內文；同上。 */
  sceneOutline: PersistedDoc;
};

export type CreatedProject = { projectId: string; screenplayId: string };

/**
 * 建立一個專案：專案、它那一份劇本（一場空戲）、故事大綱、分場大綱 —— **一個交易**（票券 71）。
 *
 * 精靈走完之前資料庫裡什麼都沒有；走完這一下，要嘛全部都在、要嘛一列都沒有。兩份大綱**一律建**，
 * 沒寫的就是空文件 —— 新專案因此用不到「第一次打開才建」那條路。
 *
 * 交易裡也照樣**走 gate 拿 handle**（傳交易進去，讀得到剛插入、還沒 commit 的那一列）：handle 永遠來自
 * 資料庫裡的 `owner_id`，這裡不例外。
 *
 * **冪等**：`creationId` 以人為範圍唯一。同一個鍵第二次進來（連點、另一個分頁還原同一份草稿再按一次）
 * 撞到 partial unique index、什麼都不寫，回傳第一次建好的那一個。兩次同時進來時，晚到的那次的插入
 * 會等先到的交易結束才知道撞了沒 —— 所以它讀到的一定是已經建完的那一份。
 *
 * 名稱去頭尾空白後是空的就丟例外：精靈已經擋過，到得了這裡就是有人繞過畫面。
 */
export async function createProject(ownerId: string, draft: ProjectDraft): Promise<CreatedProject> {
  const projectTitle = requiredName(draft.projectTitle, "專案名稱");
  const title = requiredName(draft.screenplayTitle, "劇本名稱");

  return getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(projects)
      .values({
        id: mintId(PROJECT_ID_PREFIX),
        type: SINGLE_SCREENPLAY_PROJECT,
        title: projectTitle,
        ownerId,
        creationId: draft.creationId,
      })
      .onConflictDoNothing()
      .returning({ id: projects.id });
    if (!inserted) return existingCreation(tx, ownerId, draft.creationId);

    const project = await authorizeProjectForUser(ownerId, inserted.id, tx);
    if (!project) throw new Error("剛建立的專案卻過不了 gate —— 這代表寫入沒有落地");

    const { screenplayId } = await createScreenplay(project, emptyScreenplay(), { title, db: tx });
    const screenplay = await authorizeScreenplayForUser(ownerId, screenplayId, tx);
    if (!screenplay) throw new Error("剛建立的劇本卻過不了 gate —— 這代表寫入沒有落地");

    await createFixedDocument(project, "交件大綱", draft.submissionOutline, tx);
    await createFixedDocument(screenplay, "分場大綱", draft.sceneOutline, tx);
    return { projectId: project.projectId, screenplayId };
  });
}

/** 同一個建立鍵上一次建好的那一個。 */
async function existingCreation(db: Db, ownerId: string, creationId: string): Promise<CreatedProject> {
  const [row] = await db
    .select({ projectId: projects.id, screenplayId: screenplays.id })
    .from(projects)
    .innerJoin(screenplays, eq(screenplays.projectId, projects.id))
    .where(and(eq(projects.ownerId, ownerId), eq(projects.creationId, creationId)))
    .limit(1);
  if (!row) throw new Error("建立鍵撞到了，卻讀不到那一次建好的專案");
  return row;
}

function requiredName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}不能是空的`);
  return trimmed;
}
