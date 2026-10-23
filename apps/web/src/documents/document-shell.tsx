import Link from "next/link";

import "../styles/documents.css";

/**
 * 劇本外文件頁的殼：一條極簡 header 回專案，其餘就是文件（同劇本編輯器頁，§7.10）。
 * 沒有文件 sidebar —— 導覽是純 routes ＋ 專案 hub。
 *
 * 粗體與標題要 Noto Sans TC 700：散文文件允許作者寫粗體（2026-10-24），劇本不允許（約束 2），
 * 所以那套字重只在這裡掛上，劇本頁永遠載不到。它跟 400 一樣按 unicode-range 切塊，真的出現粗體字才下載。
 */
export function DocumentShell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return (
    <main className="document-shell">
      {/* React 19 會把帶 precedence 的 stylesheet 提到 <head>、只插一次。 */}
      <link rel="stylesheet" href="/fonts/noto-sans-tc-700/fonts.css" precedence="default" />
      <header className="document-shell__bar">
        <Link href={`/projects/${projectId}`} className="document-shell__home">
          ← 專案
        </Link>
      </header>
      {children}
    </main>
  );
}
