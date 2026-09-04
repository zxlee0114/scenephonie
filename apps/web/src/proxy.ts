import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * **optimistic redirect，不是授權**（票券 30 §3、ADR-0011）。
 *
 * 它只問「有沒有 session cookie」—— 官方文件對 `getSessionCookie()` 的措辭是
 * 「lacks validation and is unsafe as your sole protection mechanism」，而那正是這裡要的：
 * 沒登入的人不必等到 route handler 才看到空白頁。**真正的判斷在每一頁自己的 gate。**
 *
 * 所以這個檔案刪掉，安全性一點都不會變 —— 這是判斷它有沒有越界的方法。
 *
 * ⚠️ Next 16 把 `middleware.ts` 更名為 `proxy.ts`、匯出的函式也叫 `proxy`。
 */
export function proxy(request: NextRequest): NextResponse {
  if (getSessionCookie(request)) return NextResponse.next();

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // 只掛在需要身分的畫面上。`/login`、`/api/auth/*` 與靜態資源不能進來，否則會自己擋自己。
  matcher: ["/projects/:path*"],
};
