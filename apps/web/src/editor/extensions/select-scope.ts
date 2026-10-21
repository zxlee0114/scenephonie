/**
 * ⌘+A 漸進式全選 —— §7.1。
 *
 *   區塊 → 這一場的內文 → 整場（NodeSelection，含 metadata）→ 整份劇本
 *
 * 在子場次裡多兩層：區塊 → 子場次內文 → 整個子場次 → 整個主場次 → 整份（票券 11）。
 * 在片段裡：區塊 → 片段內文 → 整個群組 → 整份（票券 12）。不停在「整段片段」—— 片段沒有
 * metadata、沒有自己的反白，那一步按下去畫面上什麼都看不到，像選取消失了（驗收 2026-10-21）。
 * 已經是整份時再按一次就停在整份。
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

  // 已經是整份：沒有更外面了。（不攔的話會落到下面「這一個區塊」，對 doc 建 TextSelection。）
  if (selection instanceof AllSelection) return true;

  if (selection instanceof NodeSelection) {
    const name = selection.node.type.name;
    // 選起整個場次或整個群組 —— 下一步只剩整份。
    if (name === "scene" || name === "sceneGroup") {
      view.dispatch(state.tr.setSelection(new AllSelection(doc)));
      return true;
    }
    // 子場次、成員、片段：往外一層。節點選取的 `$from` 落在節點之前，它的 parent 就是外面那一層
    // （子場次 → 主場次；成員、片段 → 群組；片段裡的子場次 → 片段，再往外一層到群組）。
    if (name === "subscene" || name === "groupMember" || name === "groupFragment") {
      const outer = $from.parent.type.name === "groupFragment" ? $from.depth - 1 : $from.depth;
      view.dispatch(state.tr.setSelection(NodeSelection.create(doc, $from.before(outer))));
      return true;
    }
  }

  // 游標不在任何區塊裡（理論上到不了）：直接整份，不對非 textblock 建 TextSelection。
  if (!$from.parent.isTextblock) {
    view.dispatch(state.tr.setSelection(new AllSelection(doc)));
    return true;
  }

  const ctx = sceneContext($from);
  const sceneDepth = ctx?.sceneDepth ?? -1;
  // 「整場」那一步：片段的話是整個群組（片段本身不是場次，沒有 metadata 可以多選進來）。
  const wholeDepth = ctx?.fragmentIndex != null ? sceneDepth - 1 : sceneDepth;
  const scenePos = sceneDepth >= 0 ? $from.before(wholeDepth) : null;

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
    next = NodeSelection.create(doc, scenePos); // 整場（含 metadata）或整個群組
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
