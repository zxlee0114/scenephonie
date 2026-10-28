/**
 * 方向鍵的動線 —— 把 chip row 與對白的人物欄接回文件（§7.1 焦點串接）。
 *
 * 這兩者都是 DOM `<input>`／`<button>`，不在 ProseMirror 的位置空間裡，所以「往上走就該回到
 * 它們」這件事沒有人會自動做。文件側的那一半在這裡：
 *
 * - 台詞第一行 ↑ → 本區塊的人物欄（補填人名，使用者回饋 2026-09-04）
 * - 場次**第一個區塊**的第一行 ↑ → 本場 chip row 的最後一格（群演，票券 34）
 * - 同上，第一個字之前 ← → 同一個地方
 * - 場次**最後一個區塊**的最後一行 ↓ → **下一場** chip row 的第一格（內外）
 * - 同上，最後一個字之後 → → 同一個地方
 * - 下一個區塊是**對白**時，最後一行 ↓／最後一個字之後 → → 它的**人物欄**，不是台詞（票券 89）
 *
 * 後兩條是前兩條的反向：chip row 第一排的 ↑／← 會離開場次去上一場內文末端（`nodes/scene`
 * 的 `enterPreviousSceneEnd`），那條路必須走得回來 —— §7.3 的環不變式（「按下去總能再按
 * 回來」）在方向鍵上同樣成立。使用者驗收回饋 2026-09-10。
 *
 * 反向（欄位 → 內文）在各自的 node view：人物欄在 `nodes/blocks`，chip row 在 `nodes/scene`
 * ——那幾顆鍵根本不會進到 ProseMirror。
 *
 * 只有游標**已經在第一／最後一行**時才跳欄 —— 多行內文裡的 ↑↓ 仍然是一般的行間移動。判斷交給
 * `view.endOfTextblock()`（ProseMirror 自己給的版面查詢，含軟換行與視覺折行）。水平那兩顆
 * 則看 `parentOffset`：貼著區塊的字首／字尾才算走到邊界。
 *
 * ⚠️ **這條路一個字都不改 doc。** 使用者要的是「回去」，Shift+Tab 那條（`block-cycle`）付出的
 * 代價是區塊被轉成對白留在原地 —— 所以環不動，改由方向鍵回答（票券 34）。
 */
import { Extension, type Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

import { blockAddressOf, sceneChipsAbove, sceneContext, type SceneContext } from "../address";
import { requestFocus } from "../focus";

/**
 * 游標所在區塊**正下方的那一排 chip row** 屬於哪一場；下面接的是同一層的區塊（交給原生的
 * 行間移動）或文件到底了，就是 null。
 *
 * 子場次讓「下面」多了三種（票券 11）：主場次的區塊下面接子場次、子場次下面接子場次，
 * 子場次是主場次最後一個孩子時下面是**下一場**。子場次下面接主場次的區塊（折返）則是一般的
 * 行間移動 —— 那裡沒有 chip row，只有一行不可編輯的「回到」。
 */
function sceneBelow($from: ResolvedPos, ctx: SceneContext): PMNode | null {
  const container = $from.node(ctx.sceneDepth);
  const next = container.maybeChild(ctx.blockIndex + 1);
  if (next) return next.type.name === "subscene" ? next : null;

  const parent = $from.node(ctx.sceneDepth - 1);
  const sibling = parent.maybeChild($from.index(ctx.sceneDepth - 1) + 1);
  // 片段（票券 12）：下一段片段是一般的行間移動；最後一段下面是群組之後的那一場。
  if (container.type.name === "groupFragment") {
    if (sibling) return null;
    const after = $from.node(ctx.sceneDepth - 2).maybeChild($from.index(ctx.sceneDepth - 2) + 1);
    return firstSceneOf(after);
  }
  if (container.type.name !== "subscene") return firstSceneOf(sibling);
  if (sibling) return sibling.type.name === "subscene" ? sibling : null;

  // 子場次的主場次可能是片段（成員的子場次）—— 往上一層是群組，不是 doc。
  if (parent.type.name === "groupFragment") return null;
  const doc = $from.node(ctx.sceneDepth - 2);
  const nextTop = doc.maybeChild($from.index(ctx.sceneDepth - 2) + 1);
  return firstSceneOf(nextTop);
}

/** 頂層節點的第一排 chip row 屬於哪一場：主場次就是它，群組是它的第一個成員。 */
function firstSceneOf(top: PMNode | null | undefined): PMNode | null {
  if (top?.type.name === "scene") return top;
  if (top?.type.name === "sceneGroup") return top.firstChild;
  return null;
}

/**
 * 從上面走進 `at`（某個區塊的內文起點）—— 是對白就**先停它的人物欄**，否則游標放進內文開頭。
 *
 * 人物欄在畫面上就在台詞正上方，回程（台詞 ↑／← → 人物欄 → 上面）本來就先經過它；去程跳過它，
 * 來回就不是同一條路（票券 89）。不論人物欄空不空都停：已經有人時多付的只是一下 Enter（票券 82）。
 * 上一個區塊的 →／↓ 與 chip row 的 ↓／→／Tab（`nodes/scene` 的 `enterBody`）共用這一支。
 *
 * 進人物欄之前先把 doc 游標擺進這一句 —— 與台詞 ↑ 進人物欄時同一個狀態（焦點在欄位、游標在這一句）。
 */
export function enterBlockFromAbove(editor: Editor, at: number): boolean {
  const { state } = editor;
  const $at = state.doc.resolve(at);
  const ctx = $at.parent.type.name === "dialogue" ? sceneContext($at) : null;
  if (ctx) {
    editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)));
    if (requestFocus({ kind: "speaker", ...blockAddressOf(ctx) })) return true;
  }
  editor.chain().focus().setTextSelection(at).run();
  return true;
}

export const VerticalNav = Extension.create({
  name: "verticalNav",
  // 壓過 StarterKit／gapcursor 的方向鍵處理。
  priority: 1102,
  addKeyboardShortcuts() {
    /**
     * 焦點被 node view 的欄位（chip row 五格、對白人物欄）拿走了嗎？
     *
     * ⚠️ 那些欄位住在 node view 裡，也就是**在 `view.dom` 之內** —— 焦點在它們身上時，它們的
     * 方向鍵照樣會冒泡到這支 keymap。欄位那側的 `stopPropagation` 擋不住：React 把 listener
     * 委派到 root container，跑得比 ProseMirror 掛在 `view.dom` 上的原生 handler **晚**。
     * 少了這道守衛，chip row 的每一顆方向鍵都會先被文件側處理一次（在內外格按 ↑ 會同時
     * 「回上一場」和「回本場群演欄」）。
     *
     * 判準是「`activeElement` 在 `view.dom` 裡，但不是 `view.dom` 自己」：游標真的在文件裡時，
     * `activeElement` 就是那個 contenteditable，也就是 `view.dom`。
     */
    const fieldHasFocus = (): boolean => {
      const { dom } = this.editor.view;
      const active = dom.ownerDocument.activeElement;
      return active !== null && active !== dom && dom.contains(active);
    };

    /** 四顆鍵共用的前置條件：游標（不是選取範圍）落在某個場次裡。 */
    const caret = (): { $from: ResolvedPos; ctx: SceneContext } | null => {
      if (fieldHasFocus()) return null;
      const { selection } = this.editor.state;
      if (!(selection instanceof TextSelection) || !selection.empty) return null;
      const ctx = sceneContext(selection.$from);
      return ctx ? { $from: selection.$from, ctx } : null;
    };

    /** 往上出界：對白先接自己的人物欄，否則回本場 chip row 的最後一格。 */
    const goUp = ($from: ResolvedPos, ctx: SceneContext): boolean => {
      // 對白先接自己的人物欄 —— 它就在台詞正上方，比 chip row 近一步。
      // 那裡再按一次 ↑ 才輪到 chip row（見 `nodes/blocks` 的 `focusPreviousBlockEnd`）。
      if ($from.parent.type.name === "dialogue") {
        // 這個對白的 node view 已經掛著了 —— 它訂閱了 focus 請求，收到就把 DOM 焦點移進人物欄。
        // 回傳「有沒有人領走」：沒人領走就不該攔這顆鍵（見 `../focus` 的 `requestFocus`）。
        return requestFocus({ kind: "speaker", ...blockAddressOf(ctx) });
      }

      // 場次開頭再往上就是本場的 metadata。**不是上一場的內文** —— chip row 在畫面上就
      // 夾在兩者之間，跳過它等於「看得到卻到不了」（票券 34）。上面接的是別的區塊（含前一段
      // 片段）就交給原生的行間移動。
      const above = sceneChipsAbove($from, ctx);
      return above != null && requestFocus({ kind: "sceneChipsEnd", sceneId: above });
    };

    /**
     * 往下出界：正下方那一場（下一場或子場次）的 chip row 第一格。下面接的是區塊（同場、下一段片段、
     * 子場次折返之後）就交給原生的行間移動 —— 除非那是一句對白：先停它的人物欄（票券 89）。
     */
    const goDown = ($from: ResolvedPos, ctx: SceneContext): boolean => {
      const below = sceneBelow($from, ctx);
      if (below) return requestFocus({ kind: "sceneMeta", sceneId: below.attrs.sceneId as string });

      const next = Selection.findFrom(this.editor.state.doc.resolve($from.after()), 1, true);
      if (next?.$from.parent.type.name !== "dialogue") return false;
      return enterBlockFromAbove(this.editor, next.from);
    };

    /**
     * 游標已經在這個區塊的**第一／最後一行**了嗎 —— 只有那時 ↑↓ 才是越界，否則是一般的行間移動。
     *
     * 版面查詢交給 `view.endOfTextblock()`（ProseMirror 自己算的，含軟換行與視覺折行），但**再
     * 加一條不看版面的判準**：游標貼著區塊的字首／字尾時，它必然就在第一／最後一行。
     *
     * ⚠️ 那條看似多餘的判準是使用者驗收回饋 2026-09-10（第三輪）修掉的 bug：「上一場末端往下，
     * 會直接到這場的內容區塊而非 metadata 區塊」。`endOfTextblock` 讀的是 `getClientRects()`
     * 的實際版面，落在區塊末端時它並不是每次都答得出 `true`（軟換行 `\n`、空區塊的
     * placeholder `<br>`、行高剛好對齊時的邊界比較都會讓它翻臉）—— 而端點這件事**不需要問
     * 版面**：`parentOffset` 就是答案，而且它只會讓判準更寬，不可能誤判成越界。
     */
    const atEdge = (dir: "up" | "down", $from: ResolvedPos): boolean =>
      this.editor.view.endOfTextblock(dir) ||
      (dir === "up" ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size);

    return {
      ArrowUp: () => {
        const at = caret();
        if (!at || !atEdge("up", at.$from)) return false;
        return goUp(at.$from, at.ctx);
      },

      ArrowDown: () => {
        const at = caret();
        if (!at || !atEdge("down", at.$from)) return false;
        return goDown(at.$from, at.ctx);
      },

      // 水平那兩顆是垂直的同一條路，只是走到邊界的判準換成「貼著這個區塊的字首／字尾」——
      // 中間的每一個位置都還有字要走，那時 ←→ 屬於文字。
      ArrowLeft: () => {
        const at = caret();
        if (!at || at.$from.parentOffset !== 0) return false;
        return goUp(at.$from, at.ctx);
      },

      ArrowRight: () => {
        const at = caret();
        if (!at || at.$from.parentOffset !== at.$from.parent.content.size) return false;
        return goDown(at.$from, at.ctx);
      },
    };
  },
});
