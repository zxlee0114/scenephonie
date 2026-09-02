/**
 * ⌘+A 漸進式全選 —— §7.1。
 *
 *   區塊 → 這一場的內文 → 整場（NodeSelection，含 metadata）→ 整份劇本
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

/** ⌘+A 一次：把選取範圍沿文件結構往外擴一層。回 `true` 表示已處理。 */
export function progressiveSelectAll(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection, doc } = state;
  const { $from, from, to } = selection;

  // 已經選起整個場次節點 —— 下一步只剩整份。
  if (selection instanceof NodeSelection && selection.node.type.name === "scene") {
    view.dispatch(state.tr.setSelection(new AllSelection(doc)));
    return true;
  }

  let sceneDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "scene") {
      sceneDepth = d;
      break;
    }
  }
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

  let next;
  if (atContent && scenePos !== null) {
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
