import { notFound } from "next/navigation";

import { isFixedDocument } from "@scenephonie/schema";

import { authorizeProject } from "@/authorization";
import { DocumentEditor } from "@/documents/document-editor";
import { DocumentShell } from "@/documents/document-shell";
import { loadDocument } from "@/persistence";

import { renameDocumentAction, saveDocumentAction } from "../actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 自由文件（票券 21）：`/projects/:id/documents/:id`。
 *
 * 網址就是掛載層級（ADR-0009）：專案層的文件掛在專案底下，劇本層的掛在劇本底下
 * （`/projects/:id/screenplays/:id/scene-outline`）。`loadDocument` 拿專案的 handle 查，
 * 劇本層的文件從這裡讀不到 —— 不存在、不是你的、掛在另一層、已刪除，都是同一個 404。
 * 固定文件有自己沒有 id 的網址（交件大綱是 `/projects/:id/story-outline`）；拿它的 id 走到這裡，
 * 照樣打得開，只是沒有名字欄。
 */
export default async function ProjectDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ projectId, documentId }, { new: justCreated }] = await Promise.all([params, searchParams]);
  const project = await authorizeProject(projectId);
  if (!project) notFound();

  const document = await loadDocument(project, documentId);
  if (!document) notFound();

  const title = isFixedDocument(document.kind)
    ? undefined
    : {
        initial: document.title,
        rename: renameDocumentAction.bind(null, project.projectId, document.documentId),
        // 「＋ 新增文件」帶著 `?new` 過來：一進來先取名字。
        focus: justCreated !== undefined,
      };
  return (
    <DocumentShell projectId={project.projectId}>
      <DocumentEditor
        kind={document.kind}
        initialBody={document.body}
        initialToken={document.token}
        save={saveDocumentAction.bind(null, { projectId: project.projectId }, document.documentId)}
        title={title}
      />
    </DocumentShell>
  );
}
