import { desc, eq } from "drizzle-orm";

import { mintId } from "@scenephonie/schema";

import { authorizeProjectForUser, type AuthorizedProject } from "@/authorization";
import { getDb } from "@/db/client";
import { projects, screenplays } from "@/db/schema";
import { emptyScreenplay } from "@/editor/empty-screenplay";
import { createScreenplay } from "@/persistence";

/**
 * 專案 —— 「一部作品」這一層的存取（§4.2）。
 *
 * 讀取一律以 `ownerId` 為條件、寫入一律經過已授權的 handle。這個模組沒有第二條路可以
 * 拿到別人的專案，所以「這是誰的」不必在每個呼叫端重問一次。
 */

const PROJECT_ID_PREFIX = "pj_";

/**
 * v1 唯一的專案類型。**不提供選擇、不做 UI** —— 只有一種類型時給選就是說謊（§4.2）。
 *
 * 1:1（一個專案一個劇本）**是這個類型的定義，不是待放寬的限制**：升級路徑是新增一種類型
 * （系列劇本專案），不是把 1:1 鬆綁成 1:N。所以下面建立專案時一定連著建立那一份劇本。
 */
export const SINGLE_SCREENPLAY_PROJECT = "單一劇本專案";

const DEFAULT_PROJECT_TITLE = "未命名專案";

export type ProjectSummary = {
  projectId: string;
  title: string;
  updatedAt: Date;
};

/** 這個人的專案，最近更新的在前。 */
export async function ownedProjects(ownerId: string): Promise<ProjectSummary[]> {
  return getDb()
    .select({ projectId: projects.id, title: projects.title, updatedAt: projects.updatedAt })
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projects.updatedAt));
}

/**
 * 開一個新專案 —— 連同它那一份劇本。
 *
 * 建完之後**回頭走一次 gate 才拿到 handle**，而不是就地捏一個。多一次 SELECT，換到的是
 * 「handle 永遠來自資料庫裡的 `owner_id`」這件事沒有例外 —— 有例外的規則等於沒有規則。
 */
export async function createProjectFor(
  ownerId: string,
  title: string = DEFAULT_PROJECT_TITLE,
): Promise<AuthorizedProject> {
  const projectId = mintId(PROJECT_ID_PREFIX);
  await getDb()
    .insert(projects)
    .values({ id: projectId, type: SINGLE_SCREENPLAY_PROJECT, title, ownerId });

  const project = await authorizeProjectForUser(ownerId, projectId);
  if (!project) throw new Error("剛建立的專案卻過不了 gate —— 這代表寫入沒有落地");

  await createScreenplay(project, emptyScreenplay());
  return project;
}

/**
 * 登入之後該落在哪個專案：最近改過的那一個，一個都沒有就開一個。
 *
 * 「第一次登入的人立刻有東西可以寫」是產品決定，不是資料模型的讓步 —— 專案與劇本都是
 * 正常建立的，沒有任何欄位為它特別開洞。
 */
export async function landingProject(ownerId: string): Promise<AuthorizedProject> {
  const [latest] = await ownedProjects(ownerId);
  if (latest) {
    const project = await authorizeProjectForUser(ownerId, latest.projectId);
    if (project) return project;
  }
  return createProjectFor(ownerId);
}

export type ProjectContents = {
  title: string;
  /** 單一劇本專案之下永遠只有一份；型別留成清單是因為那是 hub 要呈現的形狀（§7.10）。 */
  screenplayIds: string[];
};

/** 專案 hub 要顯示的東西。只吃 handle —— 到得了這裡就代表已經授權過。 */
export async function projectContents(project: AuthorizedProject): Promise<ProjectContents> {
  const db = getDb();
  const [[row], scripts] = await Promise.all([
    db.select({ title: projects.title }).from(projects).where(eq(projects.id, project.projectId)),
    db
      .select({ id: screenplays.id })
      .from(screenplays)
      .where(eq(screenplays.projectId, project.projectId))
      .orderBy(screenplays.createdAt),
  ]);

  return {
    title: row?.title ?? DEFAULT_PROJECT_TITLE,
    screenplayIds: scripts.map((script) => script.id),
  };
}
