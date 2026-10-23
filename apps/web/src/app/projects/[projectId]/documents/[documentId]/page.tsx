import { notFound } from "next/navigation";

import { authorizeProject } from "@/authorization";
import { DocumentEditor } from "@/documents/document-editor";
import { DocumentShell } from "@/documents/document-shell";
import { loadDocument } from "@/persistence";

import { renameDocumentAction, saveDocumentAction } from "../actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 專案層的文件（票券 21）：`/projects/:id/documents/:id`。v1 只有交件大綱。
 *
 * 網址就是掛載層級（ADR-0009）：專案層的文件掛在專案底下，劇本層的掛在劇本底下
 * （`/projects/:id/screenplays/:id/scene-outline`）。`loadDocument` 拿專案的 handle 查，
 * 劇本層的文件從這裡讀不到 —— 不存在、不是你的、掛在另一層，都是同一個 404。
 */
export default async function ProjectDocumentPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  const project = await authorizeProject(projectId);
  if (!project) notFound();

  const document = await loadDocument(project, documentId);
  if (!document) notFound();

  const address = { projectId: project.projectId };
  return (
    <DocumentShell projectId={project.projectId}>
      <DocumentEditor
        kind={document.kind}
        initialBody={document.body}
        initialToken={document.token}
        save={saveDocumentAction.bind(null, address, document.documentId)}
        title={{ initial: document.title, rename: renameDocumentAction.bind(null, address, document.documentId) }}
      />
    </DocumentShell>
  );
}
