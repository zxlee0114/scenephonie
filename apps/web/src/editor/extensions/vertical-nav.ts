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
import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";

import { sceneContext, type SceneContext } from "../address";
import { requestFocus } from "../focus";

/** 游標所在場次的**下一場**，沒有就是 null（也包含「本場不在場次序列裡」的防禦）。 */
function nextScene($from: ResolvedPos, ctx: SceneContext) {
  const parent = $from.node(ctx.sceneDepth - 1);
  const next = parent.maybeChild($from.index(ctx.sceneDepth - 1) + 1);
  return next?.type.name === "scene" ? next : null;
}

/** 這個區塊是本場最後一個嗎 —— 再往下就出場次了。 */
const inLastBlock = ($from: ResolvedPos, ctx: SceneContext) =>
  ctx.blockIndex === $from.node(ctx.sceneDepth).childCount - 1;

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
        requestFocus({ kind: "speaker", sceneId: ctx.sceneId, blockIndex: ctx.blockIndex });
        return true;
      }

      // 場次開頭再往上就是本場的 metadata。**不是上一場的內文** —— chip row 在畫面上就
      // 夾在兩者之間，跳過它等於「看得到卻到不了」（票券 34）。
      if (ctx.blockIndex === 0) {
        requestFocus({ kind: "sceneChipsEnd", sceneId: ctx.sceneId });
        return true;
      }

      return false;
    };

    /** 往下出界：下一場的 chip row 第一格。沒有下一場就把鍵還回去（文件到底了）。 */
    const goDown = ($from: ResolvedPos, ctx: SceneContext): boolean => {
      if (!inLastBlock($from, ctx)) return false;
      const next = nextScene($from, ctx);
      if (!next) return false;
      requestFocus({ kind: "sceneMeta", sceneId: next.attrs.sceneId as string });
      return true;
    };

    return {
      ArrowUp: () => {
        const at = caret();
        if (!at || !this.editor.view.endOfTextblock("up")) return false;
        return goUp(at.$from, at.ctx);
      },

      ArrowDown: () => {
        const at = caret();
        if (!at || !this.editor.view.endOfTextblock("down")) return false;
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
