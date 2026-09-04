import { redirect } from "next/navigation";

import { currentUserId } from "@/authorization";

import { GoogleSignIn } from "./google-sign-in";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登入頁。
 *
 * v1 不公開註冊 —— 能進來的是清單上的人（allowlist 是 env var 逗號清單，不是 `invitations` 表）。
 * 已經登入的人不必再看這頁，直接送去自己的專案。
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUserId()) redirect("/projects");

  const { error } = await searchParams;

  return (
    <main className="sign-in">
      <h1 className="sign-in__wordmark">Scenephonie</h1>
      <p className="sign-in__lede">結構化的台灣影視編劇平台。</p>
      <GoogleSignIn />
      {/* 只有 allowlist 那一種失敗說得出原因；其餘（使用者按取消、Google 端出錯…）
          不硬猜，否則會把「你被拒絕了」栽贓給一個只是點錯的人。 */}
      {error === "not-allowed" ? (
        <p className="sign-in__error" role="alert">
          這個 Google 帳號不在受邀清單上。v1 不公開註冊。
        </p>
      ) : error ? (
        <p className="sign-in__error" role="alert">
          登入沒有完成，請再試一次。
        </p>
      ) : null}
    </main>
  );
}
