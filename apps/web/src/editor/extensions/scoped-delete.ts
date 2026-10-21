/**
 * 跨場次的選取：**各場各自刪，不接起來**（票券 13、§7.5 成本 1／5）。
 *
 * `isolating` 擋得住 `joinBackward` 這類「往外併」的命令，但擋不住 **replace 的 fitting**：一段
 * 從 S1 中間選到 S2 中間的 `TextSelection` 按 ⌫，ProseMirror 會把兩端開放的區塊接起來 —— S2 的
 * 剩餘內文搬進 S1，S2 整個節點消失，`sceneId` 錨點跟著不見（不變式 ⑦：刪除不是鑄造時刻，但這也
 * 不是編劇要的刪除）。打字蓋過選取、貼上、剪下走的是同一條 replace，全部中。
 *
 * 規則（使用者決定 2026-10-22）：
 * - 每一個被選到的區塊**只刪被選到的字**；中間整個被選到的區塊拿掉 —— 但一段內容（主場次、子場次、
 *   片段）至少留一個區塊、不以子場次開頭（同 `moveBlock` 的補位規則），留下來的那個只清空文字；
 * - 場次、子場次本身（含 metadata）**一個不少**；
 * - 打字／貼上 ＝ 先這樣刪，再在起點插入。
 *
 * 只管**跨越場次邊界**的選取（範圍裡有場次、子場次或片段的邊界）。同一段內容之內的選取照
 * ProseMirror 原生行為。整場的 `NodeSelection`（⌘A 第三層）與整份的 `AllSelection` 是編劇明確選起
 * 整個節點，刪掉就是刪掉，不歸這裡。
 */
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

import { KERNEL_REPLACE } from "../command-bridge";

/** 劃出場次邊界的節點 —— 選取跨過其中任何一個的邊界，就不准 replace 把兩邊接起來。 */
const BOUNDARY_TYPES: ReadonlySet<string> = new Set([
  "scene",
  "subscene",
  "sceneGroup",
  "groupMember",
  "groupFragment",
]);

/** 這段範圍有沒有跨過場次邊界（某個邊界節點的頭或尾落在範圍裡面）。 */
export function spansScenes(doc: PMNode, from: number, to: number): boolean {
  if (from >= to) return false;
  let spans = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (spans || node.isTextblock) return false;
    if (BOUNDARY_TYPES.has(node.type.name) && (pos >= from || pos + node.nodeSize <= to)) spans = true;
    return !spans;
  });
  return spans;
}

const crossSelection = (state: EditorState) => {
  const { selection } = state;
  return selection instanceof TextSelection && spansScenes(state.doc, selection.from, selection.to);
};

/** 拿掉第 `index` 個孩子之後，這段內容還成不成立（至少一個孩子、不以子場次開頭）。 */
function survivesRemoval(container: PMNode, index: number): boolean {
  if (container.childCount <= 1) return false;
  if (index > 0) return true;
  return container.child(1).type.name !== "subscene";
}

/** 在 `tr` 上把 `[from, to)` 各場各自刪掉，游標收在起點。 */
export function deleteScoped(tr: Transaction, from: number, to: number): Transaction {
  const blocks: { pos: number; node: PMNode }[] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      blocks.push({ pos, node });
      return false;
    }
    return true;
  });

  // 從後往前刪：前面的座標不受後面的刪除影響，不必逐一 map。
  for (const { pos, node } of blocks.reverse()) {
    const start = pos + 1;
    const end = start + node.content.size;
    const $block = tr.doc.resolve(pos);
    if (from <= start && to >= end && survivesRemoval($block.parent, $block.index())) {
      tr.delete(pos, pos + node.nodeSize);
    } else {
      const a = Math.max(from, start);
      const b = Math.min(to, end);
      if (a < b) tr.delete(a, b);
    }
  }

  const at = tr.mapping.map(from, -1);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at))).setMeta(scopedDeleteKey, true);
}

/** 這筆 transaction 會不會讓某個場次消失。 */
function dropsScenes(before: PMNode, after: PMNode): boolean {
  const ids = (doc: PMNode) => {
    const out = new Set<string>();
    doc.descendants((node) => {
      if (node.isTextblock) return false;
      if (typeof node.attrs.sceneId === "string") out.add(node.attrs.sceneId);
      return true;
    });
    return out;
  };
  const kept = ids(after);
  for (const id of ids(before)) if (!kept.has(id)) return true;
  return false;
}

export const scopedDeleteKey = new PluginKey("scopedDelete");

export const ScopedDelete = Extension.create({
  name: "scopedDelete",
  // 壓過 StarterKit keymap 的 ⌫／Delete（deleteSelection）。
  priority: 1103,

  addKeyboardShortcuts() {
    const run = () => {
      const { state, view } = this.editor;
      if (!crossSelection(state)) return false;
      view.dispatch(deleteScoped(state.tr, state.selection.from, state.selection.to).scrollIntoView());
      return true;
    };
    return { Backspace: run, Delete: run, "Mod-Backspace": run, "Mod-Delete": run };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: scopedDeleteKey,
        props: {
          handleTextInput(view, from, to, text) {
            if (!spansScenes(view.state.doc, from, to)) return false;
            const tr = deleteScoped(view.state.tr, from, to);
            view.dispatch(tr.insertText(text, tr.selection.from).scrollIntoView());
            return true;
          },
          handlePaste(view, _event, slice) {
            if (!crossSelection(view.state)) return false;
            const { from, to } = view.state.selection;
            view.dispatch(deleteScoped(view.state.tr, from, to).replaceSelection(slice).scrollIntoView());
            return true;
          },
          handleDOMEvents: {
            // 剪下：複製照 PM 原生的走（剪貼簿序列化不重寫），它接著送出的 deleteSelection 由下面的
            // filterTransaction 擋掉，換成各場各自刪。
            cut(view) {
              if (!crossSelection(view.state)) return false;
              const { from, to } = view.state.selection;
              queueMicrotask(() => view.dispatch(deleteScoped(view.state.tr, from, to)));
              return false;
            },
          },
        },
        /**
         * 最後一道：選取跨場次時，**任何**會讓場次消失的使用者編輯一律擋下（注音組字蓋過選取、
         * 拖曳選取的文字…這些不經上面幾條路）。寧可那一下沒反應，也不准併掉一場。
         * kernel 的整份 replace、復原／重做、我們自己的各場各自刪不受影響。
         */
        filterTransaction(tr, state) {
          if (!tr.docChanged || !crossSelection(state)) return true;
          if (tr.getMeta("uiEvent") === "cut") return false; // 換成上面 `cut` 排進去的那一筆
          if (tr.getMeta(KERNEL_REPLACE) || tr.getMeta(scopedDeleteKey) || tr.getMeta("history$")) return true;
          return !dropsScenes(state.doc, tr.doc);
        },
      }),
    ];
  },
});
