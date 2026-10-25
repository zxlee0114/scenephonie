import { redirect } from "next/navigation";

import { currentUserId } from "@/authorization";

import { GoogleSignIn } from "./google-sign-in";
import { GuestSignIn } from "./guest-sign-in";
import { signInFailure } from "./sign-in-failure";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登入頁。
 *
 * v1 不公開註冊 —— 能進來的是清單上的人（allowlist 是 env var 逗號清單，不是 `invitations` 表）。
 * 已經登入的人不必再看這頁，直接送去專案儀表板。
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await currentUserId()) redirect("/projects");

  const failure = signInFailure((await searchParams).error);

  return (
    <main className="sign-in">
      <h1 className="sign-in__wordmark">Scenephonie</h1>
      <p className="sign-in__lede">結構化的台灣影視編劇平台。</p>
      <GoogleSignIn />
      {/* 兩道門並排。它們在畫面上是兩顆按鈕，在程式碼裡從第二步之後就是同一個 gate、
          同一份 `owner_id` —— domain 不知道使用者是從哪一顆進來的（ADR-0011 §③）。 */}
      <GuestSignIn />
      {/* 哪些失敗說得出原因、哪些不硬猜，見 `signInFailure`。 */}
      {failure === "uninvited" ? (
        <p className="sign-in__error" role="alert">
          這個 Google 帳號不在受邀清單上。v1 不公開註冊。
        </p>
      ) : failure === "generic" ? (
        <p className="sign-in__error" role="alert">
          登入沒有完成，請再試一次。
        </p>
      ) : null}
    </main>
  );
}
