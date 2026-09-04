import { headers } from "next/headers";

import { ALLOWLIST_ENV, isAllowedEmail } from "@/auth/allowlist";
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

/** 這次請求的 `UserId`，沒有登入或不在 allowlist 上就是 `null`。 */
export async function currentUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  // allowlist 的 **access** 那一半（registration 那一半在 auth 設定的 databaseHooks）。
  // 在這裡再問一次，是因為「把某個 email 從清單移掉」要在下一次請求就生效，而不是等
  // 那個人的 session 自己過期；也因為**授權的權威在 application layer，不在 library**
  // （不變式 I）—— library 的 hook 只是大門口先擋一次。
  if (!isAllowedEmail(session.user.email, process.env[ALLOWLIST_ENV])) return null;

  return session.user.id;
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
