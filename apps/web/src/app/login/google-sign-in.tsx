"use client";

import { useState } from "react";

import { authClient } from "@/auth/auth-client";

/**
 * v1 唯一的登入方式（票券 24 §5）：Google OAuth。
 *
 * 沒有密碼欄、沒有 magic link、**也沒有公開測試帳密** —— 那會把剛否決的密碼從後門放回來。
 * 「以訪客身分體驗」（`./guest-sign-in`）就長在這顆按鈕旁邊，走的是同一條 pipeline。
 */
export function GoogleSignIn() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="sign-in__google"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void authClient.signIn.social({
          provider: "google",
          callbackURL: "/projects",
          // 不在受邀清單上的人會在 OAuth callback 被擋下來（allowlist 是 registration policy）。
          // 把他送回登入頁並說清楚為什麼 —— 沉默的失敗會讓人以為是 Google 壞了。
          errorCallbackURL: "/login?error=not-allowed",
        });
      }}
    >
      {pending ? "前往 Google…" : "以 Google 帳號登入"}
    </button>
  );
}
