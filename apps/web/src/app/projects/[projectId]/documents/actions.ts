"use server";

import { notFound, redirect } from "next/navigation";

import { authorizeProject, authorizeScreenplay } from "@/authorization";
import type { SaveOutcome } from "@/editor/save-capability";
import {
  createFreeDocument,
  deleteDocument,
  renameDocument,
  restoreDocument,
  saveDocument,
  type CreativeUnit,
  type PersistedDoc,
  type SaveToken,
} from "@/persistence";

/**
 * 劇本外文件的寫入入口（票券 21）。
 *
 * **授權在這裡，而且只在這裡**（不變式 H）：瀏覽器給的是字串，先換成**那份文件掛的那一層**的 handle
 * 才進得了 persistence —— 專案層的文件過 `authorizeProject`，劇本層的過 `authorizeScreenplay`。
 * 掛錯層的位址（拿專案的 id 去存分場大綱）在 persistence 那一側查不到那一列，回 `conflict`：
 * 一份文件只有一個合法位址（不變式 F）。
 *
 * 頁面把 `address` 與 `documentId` 先 `bind` 好再交給編輯器，編輯器手上只剩「存這份 doc、帶這個 token」。
 * bind 的值仍然是從瀏覽器回來的 —— Server Action 是公開端點，這裡每次都重新過 gate。
 */

/** 一份文件掛在哪裡：專案層給專案 id，劇本層給劇本 id。 */
export type DocumentAddress = { projectId: string } | { screenplayId: string };

async function unitOf(address: DocumentAddress): Promise<CreativeUnit | null> {
  return "screenplayId" in address ? authorizeScreenplay(address.screenplayId) : authorizeProject(address.projectId);
}

/** 自動存檔。body 的 canonical 驗證在 persistence 的交易裡（照那份文件的 kind）。 */
export async function saveDocumentAction(
  address: DocumentAddress,
  documentId: string,
  doc: PersistedDoc,
  token: SaveToken,
): Promise<SaveOutcome> {
  const unit = await unitOf(address);
  if (!unit) return { status: "forbidden" };
  return saveDocument({ unit, documentId, body: doc, token });
}

/** 自由文件改名。名字不是內文 —— 不會跟另一個分頁的存檔衝突。固定文件改不了名。 */
export async function renameDocumentAction(projectId: string, documentId: string, title: string): Promise<boolean> {
  const project = await authorizeProject(projectId);
  if (!project) return false;
  return renameDocument(project, documentId, title);
}

/**
 * hub 上的「＋ 新增文件」：開一份新的自由文件、直接帶過去。名字先留空 —— 欄位裡淡淡寫著「未命名文件」，
 * 用途由編劇決定（世界觀、研究筆記、另一個字數的大綱版本……）。
 */
export async function createFreeDocumentAction(projectId: string): Promise<void> {
  const project = await authorizeProject(projectId);
  if (!project) notFound();
  const created = await createFreeDocument(project, {});
  redirect(`/projects/${project.projectId}/documents/${created.documentId}`);
}

/** 刪一份自由文件。畫面上接著出現 8 秒的「復原」。 */
export async function deleteDocumentAction(projectId: string, documentId: string): Promise<boolean> {
  const project = await authorizeProject(projectId);
  if (!project) return false;
  return deleteDocument(project, documentId);
}

/** 「復原」：把剛刪的自由文件拿回來。 */
export async function restoreDocumentAction(projectId: string, documentId: string): Promise<boolean> {
  const project = await authorizeProject(projectId);
  if (!project) return false;
  return restoreDocument(project, documentId);
}
