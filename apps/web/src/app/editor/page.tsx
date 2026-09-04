import { ScreenplayEditor } from "@/editor/ScreenplayEditor";
import { emptyScreenplay } from "@/editor/empty-screenplay";
import { loadOrCreateSoleScreenplay } from "@/persistence";

import { saveScreenplayAction } from "./actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 最小頁面殼（票券 04，§7.10）：一條極簡 header／breadcrumb 回專案，其餘就是編輯器。
 *
 * 劇本從 persistence 載進來（票券 05）。目前是「這個部署上的那一份」——
 * 專案 hub 與 `owner_id` 由票券 06 接上。
 */
export default async function EditorPage() {
  const screenplay = await loadOrCreateSoleScreenplay(emptyScreenplay);

  return (
    <main className="editor-shell">
      <header className="editor-shell__bar">
        <a href="/" className="editor-shell__home">
          Scenephonie
        </a>
        <span className="editor-shell__crumb">未命名劇本</span>
      </header>
      <ScreenplayEditor
        initialContent={screenplay.doc}
        screenplayId={screenplay.screenplayId}
        initialToken={screenplay.token}
        save={saveScreenplayAction}
      />
    </main>
  );
}
