/**
 * 三種 sceneBlock 的單一事實來源 —— 環的順序、選單文案、以及「換型別」這個意圖的執行。
 * Tab 環（`extensions/block-cycle`）與 `/` 選單（`extensions/slash`）都從這裡拿，不各自複製。
 */
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { setBlockType, type BlockType } from "@scenephonie/schema";

import type { BlockAddress } from "./address";
import { runKernelCommand } from "./command-bridge";

/** 環的成員與順序：動作 → 對白 → 插入畫面 →（回動作）。§7.3。 */
export const BLOCK_CYCLE: readonly BlockType[] = ["action", "dialogue", "insertShot"];

export const BLOCK_META: Record<BlockType, { readonly label: string; readonly hint: string }> = {
  action: { label: "動作", hint: "也可以按 Tab 切換" },
  dialogue: { label: "對白", hint: "也可以按 Tab 切換" },
  insertShot: { label: "插入畫面", hint: "場次內部的單一畫面，不產生新場次" },
};

/**
 * 這個區塊「什麼都還沒寫」—— 內文 trim 後是空的，對白還要連人物名也空。
 * 空區塊上的手勢可以自由換型別／取消型別，不會吃掉任何已寫下的東西。
 */
export function isBlankBlock(node: PMNode): boolean {
  if (node.textContent.trim() !== "") return false;
  if (node.type.name !== "dialogue") return true;
  const character = node.attrs.character as { displayName?: string } | null;
  return (character?.displayName ?? "").trim() === "";
}

/**
 * 把某個區塊換成指定型別（意圖 ＝ kernel 的 `setBlockType`），並安置游標／焦點：
 * 一律把游標放回同一個區塊（否則連按會找不到區塊）；轉成對白時另外把焦點排給人物欄。
 *
 * `focusSpeaker: false` 用在「這個區塊已經寫了字」的轉型：把焦點搶進人物欄（一個 DOM
 * `<input>`）會讓正在打字的人突然打進欄位裡，而且那顆欄位的 Tab 被 `stopPropagation` 擋著，
 * Tab 環就當場卡死、轉不下去（使用者回饋 2026-09-03）。這種時候游標留在內文。
 */
export function setBlockTypeAt(
  editor: Editor,
  at: BlockAddress,
  type: BlockType,
  { focusSpeaker = true }: { focusSpeaker?: boolean } = {},
): boolean {
  return runKernelCommand(editor, (doc) => setBlockType(doc, { ...at, type }), {
    caretAt: at,
    ...(type === "dialogue" && focusSpeaker
      ? { focusField: { kind: "speaker" as const, ...at } }
      : {}),
  });
}
