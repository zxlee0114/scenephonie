/**
 * Tab／Shift+Tab 環 —— §7.3。
 *
 * **不變式：Tab 只改變游標所在區塊的型別，永遠不動容器。** 環在任何深度都是同樣三個成員
 * （動作 → 對白 → 插入畫面），主場次與子場次一致，**不生成任何東西**。
 *
 * 意圖是 kernel 的 `setBlockType`（場次以永久 id 定址，區塊以呼叫當下算出、不被儲存的序定址）。
 * 環怎麼排是**手勢**，留在這裡；換型別是**意圖**，走 command（見 `../block-types`）。
 *
 * 欄位裡的 Tab 由 chip row／人物欄自己 `stopPropagation`（見 node view）—— 那顆 Tab 是欄位間
 * 移動，不該冒泡到這裡把正在編輯的區塊轉掉。
 */
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

import type { BlockType } from "@scenephonie/schema";

import { sceneContext } from "../address";
import { BLOCK_CYCLE, setBlockTypeAt } from "../block-types";

/** 把游標所在區塊沿環轉一格（`+1` 動作→對白→插入畫面，`-1` 反向）。不在區塊裡時回 `false`。 */
export function cycleBlock(editor: Editor, dir: 1 | -1): boolean {
  const { $from } = editor.state.selection;

  const idx = BLOCK_CYCLE.indexOf($from.parent.type.name as BlockType);
  if (idx === -1) return false;

  // 已經填了人物名的對白，Tab／Shift+Tab 一律不轉型 —— 動作／插入畫面沒有 `character` attr，
  // 轉過去會把使用者打的人物名靜默吃掉。要改型別得先清掉人物名，或走 `/` 選單（明確意圖）。
  // §7.3：低摩擦的手勢不做會造成資料損失的事（使用者回饋 2026-09-03）。
  if ($from.parent.type.name === "dialogue" && $from.parent.attrs.character != null) {
    return true; // 已處理：吞掉這顆 Tab，游標留在原地
  }

  const ctx = sceneContext($from);
  if (!ctx) return false;

  const type = BLOCK_CYCLE[(idx + dir + BLOCK_CYCLE.length) % BLOCK_CYCLE.length]!;
  return setBlockTypeAt(editor, { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex }, type);
}

export const BlockCycle = Extension.create({
  name: "blockCycle",
  // 壓過 Tiptap／StarterKit 內建的 Tab 行為（縮排等）。
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: () => cycleBlock(this.editor, 1),
      "Shift-Tab": () => cycleBlock(this.editor, -1),
    };
  },
});
