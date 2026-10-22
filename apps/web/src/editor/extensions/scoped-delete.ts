/**
 * 跨場次的選取：**各場各自刪，不接起來**（票券 13、§7.5 成本 1／5）。
 *
 * `isolating` 擋得住 `joinBackward` 這類「往外併」的命令，但擋不住 **replace 的 fitting**：一段
 * 從 S1 中間選到 S2 中間的 `TextSelection` 按 ⌫，ProseMirror 會把兩端開放的區塊接起來 —— S2 的
 * 剩餘內文搬進 S1，S2 整個節點消失，`sceneId` 錨點跟著不見（不變式 ⑦：刪除不是鑄造時刻，但這也
 * 不是編劇要的刪除）。打字蓋過選取、貼上、剪下走的是同一條 replace，全部中。
 *
 * 規則（使用者決定 2026-10-22）：
 * - 每一個被選到的區塊**只刪被選到的字**；起點之後整個被選到的區塊拿掉 —— 但一段內容（主場次、
 *   子場次、片段）至少留一個區塊、不以子場次開頭（同 `moveBlock` 的補位規則），留下來的那個只清空
 *   文字。起點所在的那個區塊永遠留著（游標要落在那裡，接著打的字才不會跑到下一場）；
 * - 場次、子場次本身（含 metadata）**一個不少**；
 * - 打字／貼上／Enter ＝ 先這樣刪，再在起點照常做。
 *
 * 貼上、拖放跨場的片段時，片段帶著場次的**殼**（被切開的場次節點、連同它的 `sceneId`）—— 照原生
 * 放進去會在落點長出新場次、把落點那場拆開（使用者驗收 2026-10-22）。所以殼一律拿掉、只放區塊
 * （`unwrapScenes`）；拖走的那一下，來源也走各場各自刪（`dropScoped`）。整場完整的節點（⌘A 選起整場
 * 再複製）不算片段：照舊貼成新的一場，`sceneId` 交給去重換新（§6.5）。
 *
 * 其餘不經這幾條路、會併掉場次的編輯（注音組字蓋過選取…）**先問**：見 `../merge-confirm`。
 *
 * 只管**跨越場次邊界**的選取（範圍裡有場次、子場次或片段的邊界）。同一段內容之內的選取照
 * ProseMirror 原生行為。整場的 `NodeSelection`（⌘A 第三層）與整份的 `AllSelection` 是編劇明確選起
 * 整個節點，刪掉就是刪掉，不歸這裡。
 */
import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";

import { KERNEL_REPLACE } from "../command-bridge";
import { mergeConfirmSkipped, mergeRequests } from "../merge-confirm";

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

/** 在 `tr` 上把 `[from, to)` 各場各自刪掉，游標收在起點（起點所在的區塊裡）。 */
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
    if (from < start && to >= end && survivesRemoval($block.parent, $block.index())) {
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

/** 片段第一個（`start`）或最後一個（`end`）區塊在片段裡的深度。 */
function edgeBlockDepth(content: Fragment, side: "start" | "end"): number {
  let node = side === "start" ? content.firstChild : content.lastChild;
  let depth = 0;
  while (node && !node.isTextblock) {
    node = side === "start" ? node.firstChild : node.lastChild;
    depth += 1;
  }
  return depth;
}

/**
 * 跨場的片段拿掉場次的殼，只留區塊；兩端被切開的區塊保持開放（貼進去會跟落點那一行接起來）。
 * 兩端都閉合的片段（整場、整個子場次）原樣不動。
 */
export function unwrapScenes(slice: Slice): Slice {
  if (slice.openStart === 0 && slice.openEnd === 0) return slice;
  const blocks: PMNode[] = [];
  let wrapped = false;
  slice.content.descendants((node) => {
    if (node.isTextblock) {
      blocks.push(node);
      return false;
    }
    if (BOUNDARY_TYPES.has(node.type.name)) wrapped = true;
    return true;
  });
  if (!wrapped) return slice;
  return new Slice(
    Fragment.from(blocks),
    slice.openStart > edgeBlockDepth(slice.content, "start") ? 1 : 0,
    slice.openEnd > edgeBlockDepth(slice.content, "end") ? 1 : 0,
  );
}

/**
 * 把跨場次的選取拖到 `insertPos`：來源各場各自刪，片段（已拿掉殼）放進落點，選起放下的那段。
 * 放回選取範圍裡面回 `null`（什麼都不做）。
 */
export function dropScoped(state: EditorState, insertPos: number, slice: Slice): Transaction | null {
  const { from, to } = state.selection;
  if (insertPos >= from && insertPos <= to) return null;
  const tr = deleteScoped(state.tr, from, to);
  const pos = tr.mapping.map(insertPos);
  tr.replaceRange(pos, pos, slice);
  let end = pos;
  tr.mapping.maps[tr.mapping.maps.length - 1]!.forEach((_from, _to, _newFrom, newTo) => (end = newTo));
  return tr.setSelection(TextSelection.between(tr.doc.resolve(pos), tr.doc.resolve(end))).setMeta("uiEvent", "drop");
}

/** 這筆 transaction 會讓幾個場次（含子場次）消失。 */
function droppedScenes(before: PMNode, after: PMNode): number {
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
  return [...ids(before)].filter((id) => !kept.has(id)).length;
}

export const scopedDeleteKey = new PluginKey("scopedDelete");
/** 編劇在確認窗按了「仍要合併」的那一筆。 */
const mergeConfirmedKey = new PluginKey("mergeConfirmed");

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
    return {
      Backspace: run,
      Delete: run,
      "Mod-Backspace": run,
      "Mod-Delete": run,
      // 先各場各自刪，再交給後面的 Enter（`ContinueBlock`、登場人物提示）在起點照常斷行。
      Enter: () => {
        const { state, view } = this.editor;
        if (crossSelection(state)) view.dispatch(deleteScoped(state.tr, state.selection.from, state.selection.to));
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    /** 攔下這一筆、問編劇；按「仍要合併」時 doc 若已經變了，這一筆就作廢（它是對著舊 doc 算的）。 */
    const ask = (tr: Transaction, state: EditorState, count: number) => {
      if (mergeRequests.get()) return; // 組字會連發好幾筆 —— 問一次就好
      const close = () => {
        mergeRequests.set(null);
        editor.view.focus();
      };
      mergeRequests.set({
        count,
        cancel: close,
        confirm: () => {
          close();
          if (editor.state.doc === state.doc) editor.view.dispatch(tr.setMeta(mergeConfirmedKey, true));
        },
      });
    };
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
          transformPasted: (slice) => unwrapScenes(slice),
          handleDrop(view, event, slice, moved) {
            if (!moved || !crossSelection(view.state)) return false;
            const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!hit) return false;
            const tr = dropScoped(view.state, dropPoint(view.state.doc, hit.pos, slice) ?? hit.pos, slice);
            if (tr) view.dispatch(tr.scrollIntoView());
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
         * 最後一道：選取跨場次時，其餘會讓場次消失的使用者編輯（注音組字蓋過選取…這些不經
         * 上面幾條路）**先問**，按了「仍要合併」才照原樣送出（`../merge-confirm`）。
         * kernel 的整份 replace、復原／重做、我們自己的各場各自刪不受影響。
         */
        filterTransaction(tr, state) {
          if (!tr.docChanged || !crossSelection(state)) return true;
          if (tr.getMeta("uiEvent") === "cut") return false; // 換成上面 `cut` 排進去的那一筆
          if (tr.getMeta(KERNEL_REPLACE) || tr.getMeta(scopedDeleteKey) || tr.getMeta(mergeConfirmedKey)) return true;
          if (isHistoryTransaction(tr)) return true;
          const count = droppedScenes(state.doc, tr.doc);
          if (count === 0 || mergeConfirmSkipped()) return true;
          ask(tr, state, count);
          return false;
        },
      }),
    ];
  },
});
