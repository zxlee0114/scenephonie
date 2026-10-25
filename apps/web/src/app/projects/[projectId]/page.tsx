import Link from "next/link";
import { notFound } from "next/navigation";

import { isFixedDocument, type DocumentKind } from "@scenephonie/schema";

import { authorizeProject } from "@/authorization";
import { cardMeta, DocumentCard } from "@/documents/document-card";
import { FreeDocumentList } from "@/documents/free-document-list";
import { documentLabel } from "@/documents/labels";
import { listDocuments } from "@/persistence";
import { projectContents } from "@/projects/project-store";

import { unarchiveFromHubAction } from "../actions";
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
 * 單一劇本專案的專案與劇本是 1:1，掛在哪個創作單位上在畫面上沒有可觀測的差別，編劇也不需要知道 ADR-0009
 * 那條掛載規則 —— 它是給系統用的。資料層照舊守著不變式 F；系列劇本專案那天，「哪一集的文件」才第一次有意義。
 *
 * 順序固定：故事大綱、分場大綱、人物介紹，再來是編劇自己新增的自由文件（早建立的在前）。
 * 卡片一直都在：票券 71 之後建立的專案兩份大綱一開始就有，之前的第一次點進去才建立。還沒有字的寫「尚未開始」。
 *
 * 寬螢幕排成卡片、手機寬度變回清單（票券 21 驗收）；兩者是同一份標記，見 `DocumentCard`。
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

  const [{ title, archived, screenplayTitle, screenplayId, screenplayUpdatedAt, screenplayExcerpt }, documents] = await Promise.all([
    projectContents(project),
    listDocuments(project),
  ]);
  const fixed = (kind: DocumentKind) => documents.find((document) => document.kind === kind);
  const freeDocuments = documents
    .filter((document) => !isFixedDocument(document.kind))
    .map((document) => ({
      documentId: document.documentId,
      title: document.title,
      meta: cardMeta(document),
      excerpt: document.excerpt,
    }));
  const projectPath = `/projects/${project.projectId}`;

  return (
    <main className="project-hub">
      <header className="project-hub__bar">
        {/* 回儀表板的路：訪客落在這裡、從劇本編輯器回來也是這一頁（票券 71 驗收）。 */}
        <Link href="/projects" className="project-hub__home">
          ← 我的專案
        </Link>
        <SignOut />
      </header>

      {/* 封存只是整理儀表板，專案照常可以寫 —— 這一條只是讓人看得出它在哪一區（票券 72）。 */}
      {archived && (
        <form className="project-hub__notice" action={unarchiveFromHubAction.bind(null, project.projectId)}>
          <span>這個專案已封存</span>
          <button type="submit" className="project-hub__add">
            取消封存
          </button>
        </form>
      )}

      <h1 className="project-hub__title">{title}</h1>

      <section className="project-hub__section">
        <h2 className="project-hub__heading">劇本</h2>
        {screenplayId ? (
          <ul className="hub-cards">
            {/* 單一劇本專案之下只有一份。卡片印**劇本名稱** —— 跟頁首的專案名稱是兩個值（票券 71）。 */}
            <DocumentCard
              href={`${projectPath}/screenplays/${screenplayId}`}
              name={screenplayTitle ?? title}
              meta={cardMeta(screenplayUpdatedAt ? { updatedAt: screenplayUpdatedAt } : undefined)}
              excerpt={screenplayExcerpt}
            />
          </ul>
        ) : (
          <p className="project-hub__empty">這個專案還沒有劇本。</p>
        )}
      </section>

      <section className="project-hub__section">
        <div className="project-hub__section-head">
          <h2 className="project-hub__heading">文件</h2>
          <form action={createFreeDocumentAction.bind(null, project.projectId)}>
            <button type="submit" className="project-hub__add">
              ＋ 新增文件
            </button>
          </form>
        </div>
        <ul className="hub-cards">
          <DocumentCard
            href={`${projectPath}/story-outline`}
            name={documentLabel("交件大綱")}
            meta={cardMeta(fixed("交件大綱"))}
            excerpt={fixed("交件大綱")?.excerpt}
          />
          {screenplayId && (
            <DocumentCard
              href={`${projectPath}/screenplays/${screenplayId}/scene-outline`}
              name={documentLabel("分場大綱")}
              meta={cardMeta(fixed("分場大綱"))}
              excerpt={fixed("分場大綱")?.excerpt}
            />
          )}
          <DocumentCard name="人物介紹" meta="尚未開放" />
          <FreeDocumentList
            projectId={project.projectId}
            documents={freeDocuments}
            deleteDocument={deleteDocumentAction.bind(null, project.projectId)}
            restoreDocument={restoreDocumentAction.bind(null, project.projectId)}
          />
        </ul>
      </section>
    </main>
  );
}
