import Link from "next/link";
import { notFound } from "next/navigation";

import { ViewSwitch } from "@/app/view-switch";
import { authorizeProjectForUser, authorizeScreenplay } from "@/authorization";
import { projectEntities } from "@/entities";
import { loadScreenplay } from "@/persistence";

import {
  createDeliveryAction,
  createEntityAction,
  renameEntityAction,
  revokeShareLinkAction,
  saveScreenplayAction,
  shareDeliveryAction,
  shareLinksAction,
  shareLiveAction,
  shareSnapshotAction,
} from "./actions";
import { ScreenplayWorkspace } from "./workspace";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 最小頁面殼（票券 04，§7.10）：一條極簡 header／breadcrumb 回專案，其餘就是編輯器。
 *
 * **住在 layout 而不是 page**（票券 15）：劇本與場次表是子路由（`./`、`./table`），但兩者是
 * 同一份劇本的兩種讀法 —— layout 跨子路由不重新掛載，編輯器切到場次表時不卸載，場次表讀的是
 * 記憶體裡的 doc（還沒存檔的字也在），回來時游標與復原堆疊都還在。兩個 page 本身是空的，
 * 它們只決定網址；哪個視圖由 `ScreenplayWorkspace` 讀網址段決定。
 *
 * **gate 在這裡**（不變式 H）：不是你的劇本就是 404 —— 與「不存在」同一個答案。UI 藏不藏
 * 不算保護，存檔那條路（`./actions.ts`）也各自再過一次 gate，因為 Server Action 是公開端點。
 *
 * 進站的游標落點跟著「剛建的還是載回來的」走（票券 26）：新建引導去填第一場的內外景欄，
 * 載回既有的稿就停在上次寫到的地方。這件事只有伺服器端知道，所以在這裡決定、往下傳。
 */
export default async function EditorLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string; screenplayId: string }>;
  children: React.ReactNode;
}) {
  const { projectId, screenplayId } = await params;

  const authorized = await authorizeScreenplay(screenplayId);
  // 網址裡的 `projectId` 必須與這份劇本真正所屬的專案一致 —— 否則同一份劇本會有無數個
  // 合法網址，而 breadcrumb 會把人帶回一個它不屬於的地方。
  if (!authorized || authorized.projectId !== projectId) notFound();

  const screenplay = await loadScreenplay(authorized);
  if (!screenplay) notFound();

  // 實體屬於專案，所以目錄要一個 **project** handle —— 這裡回頭走一次 gate 而不是就地捏一個
  // （handle 永遠來自資料庫裡的 `owner_id`，有例外的規則等於沒有規則）。
  const project = await authorizeProjectForUser(authorized.ownerId, authorized.projectId);
  if (!project) notFound();
  const entities = await projectEntities(project);
  const base = `/projects/${authorized.projectId}/screenplays/${screenplay.screenplayId}`;

  return (
    <main className="editor-shell">
      <header className="editor-shell__bar">
        <Link href={`/projects/${authorized.projectId}`} className="editor-shell__home">
          ← 專案
        </Link>
        <ViewSwitch base={base} />
      </header>
      <ScreenplayWorkspace
        base={base}
        initialContent={screenplay.doc}
        initialFocus={screenplay.origin === "created" ? "sceneMeta" : "documentEnd"}
        screenplayId={screenplay.screenplayId}
        initialToken={screenplay.token}
        save={saveScreenplayAction}
        projectId={authorized.projectId}
        entities={{
          characters: entities.characters.map(({ id, name }) => ({ id, name })),
          locations: entities.locations,
        }}
        createEntity={createEntityAction}
        renameEntity={renameEntityAction}
        createDelivery={createDeliveryAction}
        sharing={{
          shareDelivery: shareDeliveryAction,
          shareLive: shareLiveAction,
          shareSnapshot: shareSnapshotAction,
          shareLinks: shareLinksAction,
          revoke: revokeShareLinkAction,
        }}
      />
      {children}
    </main>
  );
}
