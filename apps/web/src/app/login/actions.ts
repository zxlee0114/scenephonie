"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { enterAsGuest } from "@/guest/guest-entry";

/**
 * 「以訪客身分體驗」那顆按鈕背後的一次寫入。
 *
 * **是 Server Action 不是 GET route**，兩個理由都不是風格：session cookie 要由
 * `nextCookies()` plugin 寫出去（見 `auth/auth.ts`），而這是一次會建立資料的操作 ——
 * 放在 GET 上，瀏覽器的 prefetch 就會替使用者鑄出一堆沒人要的訪客身分。
 */
export async function enterAsGuestAction(): Promise<void> {
  const projectId = await enterAsGuest(await headers());

  // redirect 靠丟例外運作，所以它必須在 try 之外 —— 這裡沒有 try，這行註解是給下一個人的。
  redirect(`/projects/${projectId}`);
}
