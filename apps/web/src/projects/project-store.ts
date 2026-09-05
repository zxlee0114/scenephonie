import { desc, eq } from "drizzle-orm";

import { mintId } from "@scenephonie/schema";

import { authorizeProjectForUser, type AuthorizedProject } from "@/authorization";
import { getDb } from "@/db/client";
import { projects, screenplays, users } from "@/db/schema";
import { emptyScreenplay } from "@/editor/empty-screenplay";
import { createScreenplay } from "@/persistence";

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
 * **這是入口點的決定，不是 domain 的分支**（票券 07）：受邀者從空白開始，訪客從範例稿開始，
 * 而 `landingProject()` 兩邊走的是同一條路 —— 它只是把呼叫端給的開場內容放進去，不問
 * 「你是誰」。domain 因此不知道有訪客這回事（ADR-0011 §③）。
 *
 * `screenplay` 是**函式**不是值：每一份開場稿都要現鑄（`sceneId` 不能兩份共用），
 * 而一個 module-level 常數會讓所有人拿到同一組 id。
 */
export type ProjectOpening = {
  title: string;
  screenplay: () => Record<string, unknown>;
};

/** 沒特別說的話就是這個：空白的專案、一場空戲。 */
const BLANK_OPENING: ProjectOpening = {
  title: DEFAULT_PROJECT_TITLE,
  screenplay: emptyScreenplay,
};

export type ProjectSummary = {
  projectId: string;
  title: string;
};

/**
 * 這個人的專案，**最近建立的在前**。
 *
 * 刻意不是「最近改過的在前」：沒有任何一條路會更新 `projects.updated_at`（改稿改的是
 * `screenplays`），拿它排序等於排一個永遠不動的欄位，卻讓讀的人以為它有意義。真要「最近
 * 改過」，得在存檔時往上寫一筆或去 join `screenplays.updated_at` —— 兩者都等到有多個專案、
 * 清單真的存在的那天再說。
 */
export async function ownedProjects(ownerId: string): Promise<ProjectSummary[]> {
  return getDb()
    .select({ projectId: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projects.createdAt));
}

export type ProjectContents = {
  title: string;
  /** 單一劇本專案之下**只有一份**（1:1 是這個 type 的定義，不是巧合）。 */
  screenplayId: string | null;
};

/** 專案 hub 要顯示的東西。只吃 handle —— 到得了這裡就代表已經授權過。 */
export async function projectContents(project: AuthorizedProject): Promise<ProjectContents> {
  const db = getDb();
  const [[row], [script]] = await Promise.all([
    db.select({ title: projects.title }).from(projects).where(eq(projects.id, project.projectId)),
    db
      .select({ id: screenplays.id })
      .from(screenplays)
      .where(eq(screenplays.projectId, project.projectId))
      .orderBy(screenplays.createdAt)
      .limit(1),
  ]);

  return { title: row?.title ?? DEFAULT_PROJECT_TITLE, screenplayId: script?.id ?? null };
}

/**
 * 登入之後該落在哪個專案：最近建立的那一個，一個都沒有就開一個（連同它那一份劇本）。
 *
 * 「第一次登入的人立刻有東西可以寫」是產品決定，不是資料模型的讓步 —— 專案與劇本都是
 * 正常建立的，沒有任何欄位為它特別開洞。
 *
 * ⚠️ **這是一次 GET 上的寫入，所以它必須冪等。** 第一次登入時的重試、prefetch 或兩個分頁
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

  // 劇本不在上面那個交易裡：交易只負責「恰好一個專案」，而它必須短 —— 它鎖著 `users` 那一列。
  // 分兩步的代價是中間斷線會留下一個沒有劇本的專案，補法就是下一次進來時這一行。
  const { screenplayId } = await projectContents(project);
  if (!screenplayId) await createScreenplay(project, opening.screenplay());

  return project;
}
