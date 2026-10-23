import type { Metadata } from "next";

import { ViewSwitch } from "@/app/view-switch";
import { authorizeShareToken } from "@/authorization";
import { loadSharedScript } from "@/persistence";
import { shareBanner } from "@/share/banner";

import { SharedWorkspace } from "./workspace";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 分享連結是給拿到它的人看的，不是給搜尋引擎的。
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * 唯讀分享頁 `/s/<token>`（票券 20，§10）—— **免註冊可看**（`proxy.ts` 只擋 `/projects`）。
 *
 * **住在 layout**，理由同編輯器（票券 15）：劇本 `./` 與場次表 `./table` 是同一個 share 的兩個視圖，
 * 兩個網址仍是同一條 token、同一個生命週期；切換視圖不重新讀資料，頁頂那一行說的永遠是畫面上那一份。
 *
 * **gate 在這裡**：token 換成 `ShareViewer`（另一種 authorization subject，ADR-0011 §②），內容從
 * `loadSharedScript` 來 —— 那是這個 handle 唯一收得進去的地方，寫路徑一支都不收它。
 *
 * 撤銷過的、不存在的、劇本已不在的，**同一個中性頁面**：不透露劇本是否存在、不透露是誰撤的、
 * 不引導去要新連結（§10.3）。
 */
export default async function ShareLayout({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await authorizeShareToken(token);
  const script = viewer ? await loadSharedScript(viewer) : null;

  if (!script) {
    return (
      <main className="share-unavailable">
        <p>這條連結已停用。</p>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <header className="editor-shell__bar">
        <p className="share-banner">{shareBanner(script)}</p>
        <ViewSwitch base={`/s/${token}`} />
      </header>
      <SharedWorkspace payload={script.payload} base={`/s/${token}`} />
    </main>
  );
}
