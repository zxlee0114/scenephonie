import { ScreenplayEditor } from "@/editor/ScreenplayEditor";

/**
 * 最小頁面殼（票券 04，§7.10）：一條極簡 header／breadcrumb 回專案，其餘就是編輯器。
 * 記憶體內 doc —— persistence（票券 05）、專案 hub（票券 06）之後接上。
 */
export default function EditorPage() {
  return (
    <main className="editor-shell">
      <header className="editor-shell__bar">
        <a href="/" className="editor-shell__home">
          Scenephonie
        </a>
        <span className="editor-shell__crumb">未命名劇本</span>
      </header>
      <ScreenplayEditor />
    </main>
  );
}
