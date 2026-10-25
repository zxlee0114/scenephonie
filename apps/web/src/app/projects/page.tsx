import { redirect } from "next/navigation";

import { currentUserId } from "@/authorization";
import { ProjectCreator } from "@/projects/project-creator";
import { ProjectShelves } from "@/projects/project-shelves";
import { ownedProjects } from "@/projects/project-store";
import { dashboardShelves } from "@/projects/retention";

import { SignOut } from "./[projectId]/sign-out";
import {
  archiveProjectAction,
  createProjectAction,
  deleteProjectAction,
  restoreProjectAction,
  unarchiveProjectAction,
} from "./actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登入之後的落點：**專案儀表板**（票券 71）。
 *
 * 總覽自己所有的專案，最近編輯的在前；按「建立專案」才建立 —— 不再一登入就替人開一個（票券 06 當初把這裡
 * 做成轉接口，理由是「v1 只會有一個專案」，那是實作時的判斷，不是使用者要的流程）。
 *
 * 主區下面是「已封存」「已刪除」兩個收合區塊（票券 72），沒有東西就不出現 —— 見 `ProjectShelves`。
 */
export default async function ProjectsPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");

  const projects = await ownedProjects(userId);

  return (
    <main className="project-hub">
      <header className="project-hub__bar">
        <span className="project-hub__wordmark">Scenephonie</span>
        <SignOut />
      </header>

      <div className="dashboard__head">
        <h1 className="project-hub__title">我的專案</h1>
        <ProjectCreator userId={userId} create={createProjectAction} />
      </div>

      <ProjectShelves
        shelves={dashboardShelves(projects)}
        now={new Date()}
        actions={{
          archive: archiveProjectAction,
          unarchive: unarchiveProjectAction,
          remove: deleteProjectAction,
          restore: restoreProjectAction,
        }}
      />
    </main>
  );
}
