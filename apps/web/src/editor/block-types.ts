/**
 * 三種 sceneBlock 的單一事實來源 —— 環的順序、選單文案、以及「換型別」這個意圖的執行。
 * Tab 環（`extensions/block-cycle`）與 `/` 選單（`extensions/slash`）都從這裡拿，不各自複製。
 */
import type { Editor } from "@tiptap/core";

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
 * 把某個區塊換成指定型別（意圖 ＝ kernel 的 `setBlockType`），並安置游標／焦點：
 * 一律把游標放回同一個區塊（否則連按會找不到區塊）；轉成對白時另外把焦點排給人物欄。
 */
export function setBlockTypeAt(editor: Editor, at: BlockAddress, type: BlockType): boolean {
  return runKernelCommand(editor, (doc) => setBlockType(doc, { ...at, type }), {
    caretAt: at,
    ...(type === "dialogue" ? { focusField: { kind: "speaker" as const, ...at } } : {}),
  });
}
