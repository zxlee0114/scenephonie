import Link from "next/link";

import "../styles/documents.css";

/**
 * 交件文件頁的殼：一條極簡 header 回專案，其餘就是文件（同劇本編輯器頁，§7.10）。
 * 沒有文件 sidebar —— 導覽是純 routes ＋ 專案 hub。
 */
export function DocumentShell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return (
    <main className="document-shell">
      <header className="document-shell__bar">
        <Link href={`/projects/${projectId}`} className="document-shell__home">
          ← 專案
        </Link>
      </header>
      {children}
    </main>
  );
}
