import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { projects, screenplays } from "@/db/schema";

import {
  grantProject,
  grantScreenplay,
  type AuthorizedProject,
  type AuthorizedScreenplay,
} from "./handles";

/**
 * authorization —— 回答「你能操作哪個 project」，**只回答這一句**。
 *
 * 責任分工（ADR-0011）：authentication 答「你是誰」、這裡答「你能操作哪個 project」、
 * domain command 答「這個操作是否合法（與人無關）」、document 是 canonical state。
 *
 * **它住在 application layer，不住在 auth library、不住在 middleware、不住在 command。**
 * middleware 只做 optimistic redirect（cookie 存不存在／cookie cache 讀得出什麼），
 * 那是體驗不是保護；真正的判斷是下面這兩支查詢，每個 route handler 都要親自跑一次。
 *
 * **也不住在資料庫**（不變式 I、ADR-0012）：Supabase 僅作為 PostgreSQL 託管，其 RLS／Auth
 * 不參與這個判斷。判準是那個可否證的問句 —— 若某個 mechanism 說「可以」而這裡說「不可以」，
 * **這裡贏**。哪天真的加上 RLS，它只能是 defense-in-depth。
 *
 * 「查不到」與「不是你的」回同一個答案（`null`），呼叫端也應該呈現同一個結果 ——
 * 兩者分開回答等於一支專案 id 的存在性探針。
 */

/**
 * 這個人能操作這個 project 嗎。
 *
 * 與 session 無關的那一半 —— **application logic 而不是 request handling**，
 * 所以它在測試裡不必偽造 cookie，也讓 `./session` 換掉時這條規則不動。
 */
export async function authorizeProjectForUser(
  userId: string,
  projectId: string,
): Promise<AuthorizedProject | null> {
  const [row] = await getDb()
    .select({ id: projects.id, ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!row || row.ownerId !== userId) return null;
  return grantProject({ projectId: row.id, ownerId: row.ownerId });
}

/**
 * 這個人能操作這份劇本嗎。
 *
 * 授權從專案來 —— 這裡走的是 `screenplays.project_id → projects.owner_id` 那條唯一的路，
 * 而不是在 `screenplays` 上再放一份 `owner_id`。第二份 owner 就是第二個答案。
 */
export async function authorizeScreenplayForUser(
  userId: string,
  screenplayId: string,
): Promise<AuthorizedScreenplay | null> {
  const [row] = await getDb()
    .select({
      screenplayId: screenplays.id,
      projectId: projects.id,
      ownerId: projects.ownerId,
    })
    .from(screenplays)
    .innerJoin(projects, eq(screenplays.projectId, projects.id))
    .where(eq(screenplays.id, screenplayId))
    .limit(1);

  if (!row || row.ownerId !== userId) return null;
  return grantScreenplay(row);
}
