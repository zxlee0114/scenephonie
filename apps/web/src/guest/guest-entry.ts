import { getAuth } from "@/auth/auth";
import { landingProject } from "@/projects/project-store";

import { DEMO_PROJECT_TITLE, demoScreenplay } from "./demo-screenplay";

/**
 * 訪客入口 —— **第二道門，不是第二套規則**（票券 24 §6、ADR-0011 §③）。
 *
 * ```
 * Google OAuth → User → Project.ownerId → Authorization → Command → Document
 * 訪客入口     → User → Project.ownerId → Authorization → Command → Document
 * ```
 *
 * 上面兩行從第二個箭頭之後**是同一段程式碼**（`landingProject()`）。這個檔案唯一多做的事
 * 是把人帶到第一個箭頭，並決定他的專案開場放什麼 —— 「開場放什麼」是入口點的問題，
 * 不是授權的問題，所以 domain、command、gate 全都不知道訪客存在。
 *
 * ⚠️ **不放公開帳密**（票券 24 §6）：公開的測試帳密會把剛否決的密碼從後門放回來，而且
 * 它是共用帳號 —— v1 沒有同步層、存檔是整列 jsonb 重寫，兩個人同時開就是 last-write-wins
 * 互相蓋掉對方的稿。每個訪客有自己的 `users` 那一列，就沒有這個問題可以發生。
 */

/**
 * 讓這次請求變成一位訪客，並回傳他該落在哪個專案。
 *
 * ⚠️ **必須在 Server Action 或 Route Handler 裡呼叫** —— session cookie 由 `nextCookies()`
 * plugin 寫出去，那個 plugin 只在這兩種情境下寫得成 `Set-Cookie`（見 `auth/auth.ts`）。
 *
 * `requestHeaders` 由呼叫端給、這裡不自己去拿 —— 與 `authorization/gate.ts`（不碰 session）
 * 和 `authorization/session.ts`（碰 session）的分法同一條線：**這個檔案是 application logic，
 * 不是 request handling**。代價是多一個參數，買到的是它在測試裡不必偽造一個請求情境。
 *
 * 已經是訪客的人再點一次會被 plugin 擋下來（「訪客不能重複匿名登入」），那是對的：
 * 他已經有一份自己的稿，再鑄一個身分只會把它變成孤兒。
 */
export async function enterAsGuest(requestHeaders: Headers): Promise<string> {
  const { user } = await getAuth().api.signInAnonymous({ headers: requestHeaders });

  // 與 Google 那條路呼叫的是同一支函式、同一個 gate、同一份冪等保證。
  const project = await landingProject(user.id, {
    title: DEMO_PROJECT_TITLE,
    screenplay: demoScreenplay,
  });

  return project.projectId;
}
