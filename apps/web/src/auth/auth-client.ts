import { createAuthClient } from "better-auth/react";

/**
 * 瀏覽器這一端的 auth handle。它只做兩件事：把人送去 Google、把人登出。
 *
 * ⚠️ **client 端沒有任何授權判斷**，也不該有 —— UI 藏起來的東西不是保護（不變式 H）。
 * 這裡拿得到的一切都只是體驗。
 */
export const authClient = createAuthClient();
