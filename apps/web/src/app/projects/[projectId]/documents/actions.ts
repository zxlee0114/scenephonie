"use server";

import { notFound, redirect } from "next/navigation";

import { authorizeProject, authorizeScreenplay } from "@/authorization";
import type { SaveOutcome } from "@/editor/save-capability";
import {
  createDocument,
  renameDocument,
  saveDocument,
  type DocumentScope,
  type PersistedDoc,
  type SaveToken,
} from "@/persistence";

/**
 * 交件文件的寫入入口（票券 21）。
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

async function scopeOf(address: DocumentAddress): Promise<DocumentScope | null> {
  return "screenplayId" in address ? authorizeScreenplay(address.screenplayId) : authorizeProject(address.projectId);
}

/** 自動存檔。body 的 canonical 驗證在 persistence 的交易裡（照那份文件的 kind）。 */
export async function saveDocumentAction(
  address: DocumentAddress,
  documentId: string,
  doc: PersistedDoc,
  token: SaveToken,
): Promise<SaveOutcome> {
  const scope = await scopeOf(address);
  if (!scope) return { status: "forbidden" };
  return saveDocument({ scope, documentId, body: doc, token });
}

/** 改名。名字不是內文 —— 不會跟另一個分頁的存檔衝突。 */
export async function renameDocumentAction(address: DocumentAddress, documentId: string, title: string): Promise<boolean> {
  const scope = await scopeOf(address);
  if (!scope) return false;
  return renameDocument(scope, documentId, title);
}

/**
 * hub 上的「＋ 新增交件大綱」：開一份新的、直接帶過去。名字先留空 —— 欄位裡淡淡寫著「交件大綱」，
 * 編劇照他要投的那個獎改（GHSA 叫劇情大綱、高雄拍叫故事大綱，我們不替他選）。
 */
export async function createSubmissionOutlineAction(projectId: string): Promise<void> {
  const project = await authorizeProject(projectId);
  if (!project) notFound();
  const created = await createDocument(project, "交件大綱", {});
  redirect(`/projects/${project.projectId}/documents/${created.documentId}`);
}
