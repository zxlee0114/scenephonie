/**
 * ⌘+A 漸進式全選 —— §7.1。
 *
 *   區塊 → 這一場的內文 → 整場（NodeSelection，含 metadata）→ 整份劇本
 *
 * 在子場次裡多兩層：區塊 → 子場次內文 → 整個子場次 → 整個主場次 → 整份（票券 11）。
 * 在片段裡：區塊 → 片段內文 → 整段片段 → 整份（票券 12）。成員是 atom、沒有內文可選。
 *
 * 內文與整場分兩步：「重寫這一場但保留 metadata」是真實的寫作動作，而場次節點連同 metadata
 * 落在內文範圍之外，不另外一步就選不到。
 *
 * 兩個坑（§7.7）：
 * - 要蓋過 Tiptap 內建 Keymap 的 `Mod-a`（它直接給 `AllSelection`）——靠 `priority`。
 * - 比對要拿「同一個函式算出來的正規化位置」：`TextSelection.between()` 會把端點移到最近的
 *   合法文字位置，拿正規化前的原始位置去比永遠不成立，⌘+A 會在前兩層之間打轉。
 */
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";

import { sceneContext } from "../address";

/** ⌘+A 一次：把選取範圍沿文件結構往外擴一層。回 `true` 表示已處理。 */
export function progressiveSelectAll(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection, doc } = state;
  const { $from, from, to } = selection;

  // 已經選起整個場次節點（或群組裡的一段片段，票券 12）—— 下一步只剩整份。
  if (
    selection instanceof NodeSelection &&
    (selection.node.type.name === "scene" || selection.node.type.name === "groupFragment")
  ) {
    view.dispatch(state.tr.setSelection(new AllSelection(doc)));
    return true;
  }
  // 選起整個子場次 —— 再往外一層是它的主場次（票券 11）。節點選取的 `$from` 落在子場次之前，
  // 它的 parent 就是主場次。
  if (selection instanceof NodeSelection && selection.node.type.name === "subscene") {
    view.dispatch(state.tr.setSelection(NodeSelection.create(doc, $from.before($from.depth))));
    return true;
  }

  const sceneDepth = sceneContext($from)?.sceneDepth ?? -1;
  const scenePos = sceneDepth >= 0 ? $from.before(sceneDepth) : null;

  const blockSel = TextSelection.create(doc, $from.start(), $from.end());
  const contentSel =
    sceneDepth >= 0
      ? TextSelection.between(
          doc.resolve($from.start(sceneDepth)),
          doc.resolve($from.end(sceneDepth)),
        )
      : null;

  const atBlock = from === blockSel.from && to === blockSel.to;
  const atContent = !!contentSel && from === contentSel.from && to === contentSel.to;
  // 單區塊場次：區塊層與內文層是同一個範圍，中間那一步是空按 —— 直接跳過。
  const contentEqualsBlock =
    !!contentSel && contentSel.from === blockSel.from && contentSel.to === blockSel.to;

  let next;
  if ((atContent || (atBlock && contentEqualsBlock)) && scenePos !== null) {
    next = NodeSelection.create(doc, scenePos); // 整場，含 metadata
  } else if (atBlock && contentSel) {
    next = contentSel; // 這一場的內文
  } else {
    next = blockSel; // 這一個區塊
  }

  view.dispatch(state.tr.setSelection(next));
  return true;
}

export const SelectScope = Extension.create({
  name: "selectScope",
  priority: 1000,
  addKeyboardShortcuts() {
    return { "Mod-a": () => progressiveSelectAll(this.editor) };
  },
});
