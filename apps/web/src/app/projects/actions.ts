"use server";

import { currentUserId } from "@/authorization";
import type { CreateProjectOutcome } from "@/projects/create-capability";
import { createProject, type ProjectDraft } from "@/projects/project-store";

/**
 * 建立精靈最後那一下（票券 71）：專案、劇本、兩份大綱一次建好。
 *
 * 瀏覽器給的每一樣都不可信 —— 名稱在 `createProject` 裡再擋一次空白，大綱內文在 persistence 的寫入邊界
 * 照那個 kind 的 schema 驗證，任何一樣不過整組回滾。專案的主人只從 session 來，不從參數來。
 *
 * 失敗不分原因回同一個答案：精靈停在第三步說「沒建成」，草稿還在、可以再按一次（同一個建立鍵，
 * 上一次其實建成了的話拿回的就是那一個）。
 */
export async function createProjectAction(draft: ProjectDraft): Promise<CreateProjectOutcome> {
  const ownerId = await currentUserId();
  if (!ownerId) return { status: "signed-out" };
  try {
    return { status: "created", ...(await createProject(ownerId, draft)) };
  } catch (error) {
    console.error("建立專案失敗", error);
    return { status: "failed" };
  }
}
