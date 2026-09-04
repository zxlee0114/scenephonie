import Link from "next/link";
import { notFound } from "next/navigation";

import { authorizeScreenplay } from "@/authorization";
import { ScreenplayEditor } from "@/editor/ScreenplayEditor";
import { loadScreenplay } from "@/persistence";

import { saveScreenplayAction } from "./actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 最小頁面殼（票券 04，§7.10）：一條極簡 header／breadcrumb 回專案，其餘就是編輯器。
 *
 * **gate 在這裡**（不變式 H）：不是你的劇本就是 404 —— 與「不存在」同一個答案。UI 藏不藏
 * 不算保護，存檔那條路（`./actions.ts`）也各自再過一次 gate，因為 Server Action 是公開端點。
 *
 * 進站的游標落點跟著「剛建的還是載回來的」走（票券 26）：新建引導去填第一場的內外景欄，
 * 載回既有的稿就停在上次寫到的地方。這件事只有伺服器端知道，所以在這裡決定、往下傳。
 */
export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string; screenplayId: string }>;
}) {
  const { projectId, screenplayId } = await params;

  const authorized = await authorizeScreenplay(screenplayId);
  // 網址裡的 `projectId` 必須與這份劇本真正所屬的專案一致 —— 否則同一份劇本會有無數個
  // 合法網址，而 breadcrumb 會把人帶回一個它不屬於的地方。
  if (!authorized || authorized.projectId !== projectId) notFound();

  const screenplay = await loadScreenplay(authorized);
  if (!screenplay) notFound();

  return (
    <main className="editor-shell">
      <header className="editor-shell__bar">
        <Link href={`/projects/${authorized.projectId}`} className="editor-shell__home">
          ← 專案
        </Link>
        <span className="editor-shell__crumb">劇本</span>
      </header>
      <ScreenplayEditor
        initialContent={screenplay.doc}
        initialFocus={screenplay.origin === "created" ? "sceneMeta" : "documentEnd"}
        screenplayId={screenplay.screenplayId}
        initialToken={screenplay.token}
        save={saveScreenplayAction}
      />
    </main>
  );
}
