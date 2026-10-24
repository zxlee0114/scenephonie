import { notFound } from "next/navigation";

import { saveDocumentAction } from "@/app/projects/[projectId]/documents/actions";
import { authorizeScreenplay } from "@/authorization";
import { DocumentEditor } from "@/documents/document-editor";
import { DocumentShell } from "@/documents/document-shell";
import { openSceneOutline } from "@/persistence";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 這份劇本的分場大綱（票券 21）：劇本層、一份劇本一份、自由文字、不與場次關聯。
 *
 * 網址沒有文件 id —— 一份劇本只有一份，它的位址就是劇本的位址加上它的 kind。第一次打開時建立：
 * 這是 GET 上的寫入，所以它必須冪等（`openSceneOutline` 靠一條 partial unique index 排序並行的
 * 第一次打開，與 `landingProject` 同一個理由）。
 *
 * 不在劇本編輯器的 layout 裡（那個 layout 住在 route group `(editor)`）：分場大綱不是劇本的另一種讀法。
 */
export default async function SceneOutlinePage({
  params,
}: {
  params: Promise<{ projectId: string; screenplayId: string }>;
}) {
  const { projectId, screenplayId } = await params;
  const screenplay = await authorizeScreenplay(screenplayId);
  // 網址裡的 `projectId` 必須是這份劇本真正所屬的專案（同編輯器頁）。
  if (!screenplay || screenplay.projectId !== projectId) notFound();

  const document = await openSceneOutline(screenplay);
  return (
    <DocumentShell projectId={screenplay.projectId}>
      <DocumentEditor
        kind={document.kind}
        initialBody={document.body}
        initialToken={document.token}
        save={saveDocumentAction.bind(null, { screenplayId: screenplay.screenplayId }, document.documentId)}
      />
    </DocumentShell>
  );
}
