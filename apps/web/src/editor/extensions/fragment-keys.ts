/**
 * `⌘+1`／`⌘+2`／`⌘+3` —— 切換游標所在片段的歸屬（票券 12、§4.5、ADR-0004）。輕手勢，一段對剪
 * 要用五到十次。
 *
 * **直接定址，不循環**：鍵上的數字就是第幾個成員（成員 chip row 前面印著 `⌘1`、`⌘2`…）。三地對剪
 * 也算常見，循環要編劇記住順序，那是心流的裂縫。**超出成員數的鍵是無效鍵** —— 在片段裡吞掉、
 * 什麼都不做，永遠不會憑空建立場次（會產生永久錨點的動作，入口只有「對剪到…」一個）。
 *
 * **從游標這一行切開**（使用者裁決 2026-10-20）：游標所在區塊（含其後）歸給成員 N。
 *
 * | 游標在 | 結果 |
 * |---|---|
 * | 片段第一行 | 整段改歸屬 |
 * | 片段中間 | 切成兩段，後一截歸成員 N |
 * | 末尾剛按 Enter 開的空行 | 等於開一個新片段給成員 N |
 *
 * 相鄰同成員的片段由 kernel 合併（正規化），所以切給「下一段本來就是的那個成員」不會留下兩段。
 * 意圖是 kernel 的 `assignFragmentToMember`；`fragmentIndex`／`fromBlockIndex` 是這裡從游標算出的
 * 傳遞參數，不被任何東西儲存。
 *
 * 不在片段裡時這幾顆鍵原封還給瀏覽器（Chrome 的 ⌘+數字是切分頁）。
 */
import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

import { assignFragmentToMember } from "@scenephonie/schema";

import { fragmentIndexOf, groupMembersOf } from "../address";
import { runKernelCommand } from "../command-bridge";

/** 游標所在片段（depth）；不在片段裡回 `null`。在片段裡的子場次裡也算 —— 那時切點是子場次。 */
function fragmentDepth($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "groupFragment") return d;
  }
  return null;
}

/**
 * 游標所在 textblock 是群組裡第幾個 textblock、在它裡面的偏移。切開與合併只增減片段的邊界，
 * 不動任何一個 textblock —— 所以「群組裡第 k 個 textblock」在 command 前後指的是同一行。
 */
function caretInGroup(group: PMNode, groupStart: number, $from: ResolvedPos) {
  let k = 0;
  let found = -1;
  group.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return true;
    if (groupStart + pos === $from.before()) found = k;
    k++;
    return false;
  });
  return { k: found, offset: $from.parentOffset };
}

function restoreCaret(editor: Editor, groupId: string, k: number, offset: number) {
  const { doc } = editor.state;
  let target: number | null = null;
  doc.forEach((top, topPos) => {
    if (target != null || top.attrs.groupId !== groupId) return;
    let i = 0;
    top.descendants((node, pos) => {
      if (target != null) return false;
      if (!node.isTextblock) return true;
      if (i++ === k) target = topPos + 1 + pos + 1 + Math.min(offset, node.content.size);
      return false;
    });
  });
  if (target != null) {
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, target)));
  }
}

/** 把游標所在片段（從游標這一行起）切給第 `ordinal` 個成員。回 `true` ＝ 這顆鍵歸我們。 */
export function assignFragmentAtCaret(editor: Editor, ordinal: number): boolean {
  const { selection } = editor.state;
  const { $from } = selection;
  const depth = fragmentDepth($from);
  if (depth == null) return false;

  const group = $from.node(depth - 1);
  const member = groupMembersOf(group)[ordinal - 1];
  // 無效鍵：吞掉，什麼都不做。
  if (!member) return true;

  const groupId = group.attrs.groupId as string;
  const caret = caretInGroup(group, $from.start(depth - 1), $from);
  const ran = runKernelCommand(
    editor,
    (doc) =>
      assignFragmentToMember(doc, {
        groupId,
        fragmentIndex: fragmentIndexOf(group, $from.index(depth - 1)),
        fromBlockIndex: $from.index(depth),
        memberId: member.attrs.sceneId as string,
      }),
    { keepFocus: true },
  );
  // 整份 replace 把游標沖到 doc 的一端 —— 放回同一行的同一個位置。
  if (ran && caret.k >= 0) restoreCaret(editor, groupId, caret.k, caret.offset);
  return true;
}

export const FragmentKeys = Extension.create({
  name: "fragmentKeys",
  addKeyboardShortcuts() {
    const keys: Record<string, () => boolean> = {};
    for (let n = 1; n <= 9; n++) keys[`Mod-${n}`] = () => assignFragmentAtCaret(this.editor, n);
    return keys;
  },
});
