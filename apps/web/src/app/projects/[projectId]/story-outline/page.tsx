import { notFound } from "next/navigation";

import { authorizeProject } from "@/authorization";
import { DocumentEditor } from "@/documents/document-editor";
import { DocumentShell } from "@/documents/document-shell";
import { openSubmissionOutline } from "@/persistence";

import { saveDocumentAction } from "../documents/actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 這個專案的故事大綱（交件大綱，票券 21）：專案層、一個專案一份。
 *
 * 網址沒有文件 id，理由同分場大綱：一個專案只有一份，它的位址就是專案的位址加上它是什麼。
 * 第一次打開時建立 —— GET 上的寫入，所以 `openSubmissionOutline` 冪等（partial unique index 排序並行的第一次打開）。
 */
export default async function StoryOutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await authorizeProject(projectId);
  if (!project) notFound();

  const document = await openSubmissionOutline(project);
  return (
    <DocumentShell projectId={project.projectId}>
      <DocumentEditor
        kind={document.kind}
        initialBody={document.body}
        initialToken={document.token}
        save={saveDocumentAction.bind(null, { projectId: project.projectId }, document.documentId)}
      />
    </DocumentShell>
  );
}
