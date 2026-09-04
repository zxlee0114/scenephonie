import { redirect } from "next/navigation";

import { currentUserId } from "@/authorization";
import { landingProject } from "@/projects/project-store";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 登入之後的落點：**自己的專案**。
 *
 * v1 沒有專案清單頁 —— 使用者只會有一部作品在寫，清單是一個多出來的停點。`/projects`
 * 因此是一個轉接口而不是一個畫面；哪天真的有多部作品，這裡就是它自然長出來的位置。
 */
export default async function ProjectsPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");

  const project = await landingProject(userId);
  redirect(`/projects/${project.projectId}`);
}
