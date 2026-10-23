import Link from "next/link";
import { notFound } from "next/navigation";

import { authorizeProject } from "@/authorization";
import { FreeDocumentList } from "@/documents/free-document-list";
import { documentLabel } from "@/documents/labels";
import { listDocuments } from "@/persistence";
import { projectContents } from "@/projects/project-store";

import { createFreeDocumentAction, deleteDocumentAction, restoreDocumentAction } from "./documents/actions";
import { SignOut } from "./sign-out";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 專案首頁 ＝ **hub**（§7.10）。
 *
 * 導覽是**純 routes ＋ 這一頁**，沒有文件 sidebar —— 前提是「單一劇本專案」（文件數少、
 * 沒有橫向的兄弟序列）。系列劇本專案一來兩個前提同時失效，那時 sidebar 才第一次有正當理由；
 * route tree `/projects/:id/screenplays/:id` 已經把層級編碼進去，sidebar 是漸進增強。
 *
 * 文件是**一份平的清單**，不分「專案層／劇本層」（2026-10-24 使用者裁決，取代 §7.10 原本的兩區）：
 * 單一劇本專案的專案與劇本是 1:1，掛哪一層在畫面上沒有可觀測的差別，編劇也不需要知道 ADR-0009
 * 那條掛載規則 —— 它是給系統用的。資料層照舊守著不變式 F；系列劇本專案那天，「哪一集的文件」才第一次有意義。
 *
 * 順序固定：故事大綱、分場大綱、人物介紹，再來是編劇自己新增的自由文件（早建立的在前）。
 * 固定文件第一次點進去才建立，所以連結一直都在。
 *
 * ⚠️ **gate 在這裡，不在 UI**：`authorizeProject` 過不了就是 404 —— 與「這個專案不存在」
 * 同一個答案，否則這一頁會變成一支專案 id 的存在性探針。
 */
export default async function ProjectHubPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await authorizeProject(projectId);
  if (!project) notFound();

  const [{ title, screenplayId }, documents] = await Promise.all([projectContents(project), listDocuments(project)]);
  const freeDocuments = documents
    .filter((document) => document.kind === "自由文件")
    .map(({ documentId, title }) => ({ documentId, title }));
  const projectPath = `/projects/${project.projectId}`;

  return (
    <main className="project-hub">
      <header className="project-hub__bar">
        <span className="project-hub__wordmark">Scenephonie</span>
        <SignOut />
      </header>

      <h1 className="project-hub__title">{title}</h1>

      <section className="project-hub__section">
        <h2 className="project-hub__heading">劇本</h2>
        {screenplayId ? (
          <ul className="project-hub__list">
            <li>
              {/* 單一劇本專案之下只有一份，名字就是專案名 —— 劇本沒有自己的標題欄位。 */}
              <Link href={`/projects/${project.projectId}/screenplays/${screenplayId}`}>{title}</Link>
            </li>
          </ul>
        ) : (
          <p className="project-hub__empty">這個專案還沒有劇本。</p>
        )}
      </section>

      <section className="project-hub__section">
        <h2 className="project-hub__heading">文件</h2>
        <ul className="project-hub__list">
          <li>
            <Link href={`${projectPath}/story-outline`}>{documentLabel("交件大綱")}</Link>
          </li>
          {screenplayId && (
            <li>
              <Link href={`${projectPath}/screenplays/${screenplayId}/scene-outline`}>{documentLabel("分場大綱")}</Link>
            </li>
          )}
          <li className="project-hub__pending">人物介紹（尚未開放）</li>
          <FreeDocumentList
            projectId={project.projectId}
            documents={freeDocuments}
            deleteDocument={deleteDocumentAction.bind(null, project.projectId)}
            restoreDocument={restoreDocumentAction.bind(null, project.projectId)}
          />
        </ul>
        <form action={createFreeDocumentAction.bind(null, project.projectId)}>
          <button type="submit" className="project-hub__add">
            ＋ 新增文件
          </button>
        </form>
      </section>
    </main>
  );
}
