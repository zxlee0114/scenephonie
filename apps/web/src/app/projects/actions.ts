"use server";

import { notFound, redirect } from "next/navigation";

import { authorizeDeletedProject, authorizeProject, currentUserId } from "@/authorization";
import type { CreateProjectOutcome } from "@/projects/create-capability";
import {
  archiveProject,
  createProject,
  deleteProject,
  restoreProject,
  unarchiveProject,
  type ProjectDraft,
} from "@/projects/project-store";

/**
 * 建立精靈最後那一下（票券 71）：專案、劇本、兩份大綱一次建好。
 *
 * 瀏覽器給的每一樣都不可信 —— 名稱在 `createProject` 裡再擋一次空白，大綱內文在 persistence 的寫入邊界
 * 照那個 kind 的 schema 驗證，任何一樣不過整組回滾。專案的主人只從 session 來，不從參數來。
 *
 * 失敗不分原因回同一個答案：精靈停在第三步說「沒建成」，草稿還在、可以再按一次（同一個建立鍵，
 * 上一次其實建成了的話拿回的就是那一個）。
 */
export async function createProjectAction(draft: ProjectDraft): Promise<CreateProjectOutcome> {
  const ownerId = await currentUserId();
  if (!ownerId) return { status: "signed-out" };
  try {
    return { status: "created", ...(await createProject(ownerId, draft)) };
  } catch (error) {
    console.error("建立專案失敗", error);
    return { status: "failed" };
  }
}

/*
 * 封存、取消封存、刪除、還原（票券 72）。每一支都**重新過 gate** —— Server Action 是公開端點，專案 id 是瀏覽器
 * 給的。回 `false` 不分原因（沒登入、不是你的、已經刪了）：畫面只需要知道「沒做成」。
 *
 * 前三支走一般的 gate，所以已刪除的專案封存不了、也刪不了第二次；還原走它自己的窄入口。
 */

export async function archiveProjectAction(projectId: string): Promise<boolean> {
  const project = await authorizeProject(projectId);
  if (!project) return false;
  await archiveProject(project);
  return true;
}

export async function unarchiveProjectAction(projectId: string): Promise<boolean> {
  const project = await authorizeProject(projectId);
  if (!project) return false;
  await unarchiveProject(project);
  return true;
}

export async function deleteProjectAction(projectId: string): Promise<boolean> {
  const project = await authorizeProject(projectId);
  if (!project) return false;
  await deleteProject(project);
  return true;
}

export async function restoreProjectAction(projectId: string): Promise<boolean> {
  const project = await authorizeDeletedProject(projectId);
  if (!project) return false;
  await restoreProject(project);
  return true;
}

/** 專案首頁那條「這個專案已封存・取消封存」的按鈕：取消封存之後回到同一頁（橫幅跟著消失）。 */
export async function unarchiveFromHubAction(projectId: string): Promise<void> {
  const project = await authorizeProject(projectId);
  if (!project) notFound();
  await unarchiveProject(project);
  redirect(`/projects/${project.projectId}`);
}
