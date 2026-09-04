import { headers } from "next/headers";

import { getAuth } from "@/auth/auth";

import { authorizeProjectForUser, authorizeScreenplayForUser } from "./gate";
import type { AuthorizedProject, AuthorizedScreenplay } from "./handles";

/**
 * 把「這次請求是誰發的」變成一個 `UserId`，然後交給 gate。
 *
 * 這裡是 authentication 與 authorization 唯一的接縫：**下面每一支都只回傳 handle 或 `null`**，
 * 不回傳 session、不回傳 user 物件、更不回傳 `accounts` 裡的任何東西 —— domain 只認 `users.id`
 * （ADR-0011 §①）。
 */

/**
 * 這次請求的 `UserId`，沒有登入就是 `null`。
 *
 * ⚠️ **這裡刻意不查 allowlist。** allowlist 的定義是「**Google OAuth** 的 registration/access
 * policy」（票券 24 §7），而這條路上每一種 authentication entry point 都會經過 ——
 * 票券 07 的訪客入口拿到的是正常的 `UserId`，但它的 email 不在清單上（票券 24 §7 明寫
 * 「Guest 入口不進 allowlist」）。在這裡查，等於逼票券 07 長出一個授權例外，
 * 而 ADR-0011 §③ 說的正是「**domain 不知道誰是訪客**，訪客體驗因此不需要任何授權例外」。
 *
 * 所以 allowlist 只擋 Google 那道門（`auth/auth.ts` 的 `databaseHooks.user.create.before`）。
 * **要撤銷某個人的存取，就刪掉他的 `users` 那一列** —— FK cascade 會連 session 一起帶走，
 * 下一次請求立刻生效。v1 使用者 < 10 人，這是一行 SQL，不值得為它在每次請求上加一道檢查。
 */
export async function currentUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** 這次請求能不能操作這個 project。未登入與不是你的，回同一個答案。 */
export async function authorizeProject(projectId: string): Promise<AuthorizedProject | null> {
  const userId = await currentUserId();
  return userId ? authorizeProjectForUser(userId, projectId) : null;
}

/** 這次請求能不能操作這份劇本。 */
export async function authorizeScreenplay(
  screenplayId: string,
): Promise<AuthorizedScreenplay | null> {
  const userId = await currentUserId();
  return userId ? authorizeScreenplayForUser(userId, screenplayId) : null;
}
