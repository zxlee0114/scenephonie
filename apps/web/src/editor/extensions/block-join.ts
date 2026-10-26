/**
 * 區塊邊界上的 `Backspace`／`Delete` —— 對白之間的不變式（票券 62，使用者裁決 2026-10-26）：
 *
 * > **Backspace／Delete 不會刪掉、也不會併掉一句帶人物的對白** —— 人物只會在編劇一步一步拆的時候消失。
 *
 * ProseMirror 預設的 `joinBackward` 不知道這件事：`joinMaybeClear` 只看**內文**長度，上一個區塊
 * 內文空著就把它整個刪掉（人物 chip 一起）；`join` 保留前一個節點的 attrs，後一句的人物被丟掉。
 *
 * 空的人物欄與台詞開頭是**同一個位置**（編劇眼裡就是這一行的開頭），所以人物欄那一側
 * （`nodes/blocks.tsx`）也走這裡的 `backspaceAtBlockStart`。
 */
import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { blockAddressOf, sceneContext } from "../address";
import { hasSpeaker, isBlankBlock, setBlockTypeAt } from "../block-types";
import { requestFocus } from "../focus";

/**
 * 在第 `blockPos` 個區塊（區塊節點本身的位置）的開頭按 Backspace。回 `false` 交還 ProseMirror 預設。
 */
export function backspaceAtBlockStart(editor: Editor, blockPos: number): boolean {
  const { state } = editor;
  const $block = state.doc.resolve(blockPos);
  const node = $block.nodeAfter;
  if (!node) return false;

  // 有人物的對白 ＝ 往左走進人物欄、拿起最後一顆 chip（整串反白），接上那一欄的三段式 Backspace：
  // 拿起 → 清空 → 放手。人物每一步都是編劇看著拆掉的；齊聲時一顆一顆走，不另開「整串清掉」的捷徑。
  if (hasSpeaker(node)) {
    const ctx = sceneContext(state.doc.resolve(blockPos + 1));
    return ctx ? requestFocus({ kind: "speaker", ...blockAddressOf(ctx), pickUp: true }) : false;
  }

  // 空對白 ＝ 「這一行我不要」：整句拿掉，游標回上一個區塊的文字尾端。拿掉的永遠是這一句，
  // 上一句不碰（`joinMaybeClear` 刪的是上一句 —— 就是它把「我是龍」連人物一起刪掉的）。
  if (node.type.name === "dialogue" && isBlankBlock(node)) {
    // 一段內容（場次／子場次／片段）的第一個區塊：上面是場次抬頭，沒有「上一個區塊的文字尾端」
    // 可以回去，一段內容也至少要留一個區塊 —— 退回成空描述（同 Enter 的退路），區塊留著。
    const index = $block.index();
    if (index === 0 || !$block.parent.canReplace(index, index + 1)) {
      const ctx = sceneContext(state.doc.resolve(blockPos + 1));
      return ctx ? setBlockTypeAt(editor, blockAddressOf(ctx), "action") : false;
    }
    const tr = state.tr.delete(blockPos, blockPos + node.nodeSize);
    editor.view.dispatch(
      tr.setSelection(TextSelection.near(tr.doc.resolve(blockPos), -1)).scrollIntoView(),
    );
    return true;
  }

  // 上一句是「有人物、台詞空」的對白：**併不刪**。`joinMaybeClear` 會把它當成空區塊整句刪掉；
  // 這裡改成把這一行的字接進那句的台詞，人物留著，游標停在接縫。
  const before = $block.nodeBefore;
  if (before && hasSpeaker(before) && before.content.size === 0) {
    const tr = state.tr.join(blockPos);
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, blockPos - 1)).scrollIntoView());
    return true;
  }
  return false;
}

/**
 * 人物欄的空輸入框上按 Backspace（欄位裡沒有任何一顆 chip）—— 與台詞開頭是同一個位置，所以把
 * 游標放到台詞開頭，照那裡的規則走；沒有特別規則時就是一般的往回併。人物欄還有 chip 時不歸
 * 這裡（游標停在第一顆 chip 前面那道縫，左邊沒東西可拿）：回 `false`，什麼都不做。
 */
export function backspaceFromSpeakerField(editor: Editor, blockPos: number): boolean {
  const node = editor.state.doc.nodeAt(blockPos);
  if (!node || node.type.name !== "dialogue" || hasSpeaker(node)) return false;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, blockPos + 1)));
  editor.view.focus();
  if (!backspaceAtBlockStart(editor, blockPos)) editor.commands.joinBackward();
  return true;
}

/**
 * 在第 `blockPos` 個區塊的文字尾端按 Delete（往前刪）。同一條不變式的另一面：
 * - 下一句帶人物 → **什麼都不做**（`joinForward` 會把它的台詞併上來、人物丟掉）。Mac 上很少人
 *   往前刪，不另開「走進下一句人物欄」的路。
 * - 這一句是有人物、台詞空的對白 → **併不刪**：下一行的字接進台詞（`joinMaybeClear` 會把這一句
 *   當成空區塊刪掉）。
 */
export function deleteAtBlockEnd(editor: Editor, blockPos: number): boolean {
  const { state } = editor;
  const node = state.doc.resolve(blockPos).nodeAfter;
  if (!node) return false;
  const $after = state.doc.resolve(blockPos + node.nodeSize);
  const next = $after.nodeAfter;
  if (!next?.isTextblock) return false;
  if (hasSpeaker(next)) return true;
  if (hasSpeaker(node) && node.content.size === 0) {
    const tr = state.tr.join($after.pos);
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, blockPos + 1)).scrollIntoView());
    return true;
  }
  return false;
}

export const BlockJoin = Extension.create({
  name: "blockJoin",
  // 壓過 StarterKit keymap 的 ⌫（priority 1000）；跨場次選取歸 `ScopedDelete`（1103）先看。
  priority: 1102,
  addKeyboardShortcuts() {
    const atStart = () => {
      const { selection } = this.editor.state;
      if (!(selection instanceof TextSelection) || !selection.empty) return false;
      const { $from } = selection;
      if (!$from.parent.isTextblock || $from.parentOffset !== 0) return false;
      return backspaceAtBlockStart(this.editor, $from.before());
    };
    const atEnd = () => {
      const { selection } = this.editor.state;
      if (!(selection instanceof TextSelection) || !selection.empty) return false;
      const { $from } = selection;
      if (!$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return false;
      return deleteAtBlockEnd(this.editor, $from.before());
    };
    return {
      Backspace: atStart,
      "Mod-Backspace": atStart,
      Delete: atEnd,
      "Mod-Delete": atEnd,
    };
  },
});
