import Link from "next/link";
import { notFound } from "next/navigation";

import { authorizeProject } from "@/authorization";
import { projectContents } from "@/projects/project-store";

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
 * 分成「專案層」與「劇本層」兩區，是因為**導覽形狀本身在教 [ADR-0009] 的掛載規則**：
 * 文件掛在它描述的創作單位上。所以即使 v1 的專案層還沒有任何文件，這一區也照樣站在這裡。
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

  const { title, screenplayId } = await projectContents(project);

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

      {/* 兩區並排就是那條掛載規則本身：**文件掛在它描述的創作單位上**（ADR-0009）。
          交件大綱與角色設定表描述的是整個專案，分場大綱描述的是那一份劇本。
          v1 兩區都還沒有內容（票券 21），但位置是對的 —— 空著比掛錯地方好，而且形狀
          先站在這裡，日後加文件時不會有人需要重新決定它該掛哪。 */}
      <section className="project-hub__section">
        <h2 className="project-hub__heading">專案層文件</h2>
        <p className="project-hub__empty">交件大綱與角色設定表尚未開放。</p>
      </section>

      <section className="project-hub__section">
        <h2 className="project-hub__heading">劇本層文件</h2>
        <p className="project-hub__empty">分場大綱尚未開放。</p>
      </section>
    </main>
  );
}
