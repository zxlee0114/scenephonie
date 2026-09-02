/**
 * Tab／Shift+Tab 環 —— §7.3。
 *
 * **不變式：Tab 只改變游標所在區塊的型別，永遠不動容器。** 環在任何深度都是同樣三個成員
 * （動作 → 對白 → 插入畫面），主場次與子場次一致，**不生成任何東西**。
 *
 * 意圖是 kernel 的 `setBlockType({ sceneId, blockIndex, type })`（場次以永久 id 定址，區塊以
 * 呼叫當下算出、不被儲存的序定址）。環怎麼排是**手勢**，留在這裡；換型別是**意圖**，走 command。
 *
 * 欄位裡的 Tab 由 chip row／人物欄自己 `stopPropagation`（見 node view）—— 那顆 Tab 是欄位間
 * 移動，不該冒泡到這裡把正在編輯的區塊轉掉。
 */
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

import { setBlockType, type BlockType } from "@scenephonie/schema";

import { runKernelCommand } from "../command-bridge";

const CYCLE: readonly BlockType[] = ["action", "dialogue", "insertShot"];

/** 把游標所在區塊沿環轉一格（`+1` 動作→對白→插入畫面，`-1` 反向）。不在區塊裡時回 `false`。 */
export function cycleBlock(editor: Editor, dir: 1 | -1): boolean {
  const { $from } = editor.state.selection;

  const idx = CYCLE.indexOf($from.parent.type.name as BlockType);
  if (idx === -1) return false;

  let sceneDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "scene") {
      sceneDepth = d;
      break;
    }
  }
  if (sceneDepth === -1) return false;

  const sceneId = $from.node(sceneDepth).attrs.sceneId as string;
  const blockIndex = $from.index(sceneDepth);
  const type = CYCLE[(idx + dir + CYCLE.length) % CYCLE.length]!;

  return runKernelCommand(editor, (doc) => setBlockType(doc, { sceneId, blockIndex, type }), {
    // 環一定要把游標放回同一個區塊，否則連按 Tab 第二下會找不到區塊。
    caretAt: { sceneId, blockIndex },
    // 轉成對白時另外把焦點排給人物欄（node view 掛載時 claim）。
    ...(type === "dialogue"
      ? { focusField: { kind: "speaker" as const, sceneId, blockIndex } }
      : {}),
  });
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
