/**
 * 方向鍵的垂直動線 —— 把 chip row 與對白的人物欄接回文件（§7.1 焦點串接）。
 *
 * 這兩者都是 DOM `<input>`／`<button>`，不在 ProseMirror 的位置空間裡，所以「往上走就該回到
 * 它們」這件事沒有人會自動做。文件側的那一半在這裡：
 *
 * - 台詞第一行 ↑ → 本區塊的人物欄（補填人名，使用者回饋 2026-09-04）
 * - 場次**第一個區塊**的第一行 ↑ → 本場 chip row 的最後一格（票券 34）
 *
 * 反向（欄位 → 內文）在各自的 node view：人物欄在 `nodes/blocks`，chip row 在 `nodes/scene`
 * ——那幾顆鍵根本不會進到 ProseMirror。
 *
 * 只有游標**已經在第一行**時才跳欄 —— 多行內文裡的 ↑ 仍然是一般的行間移動。判斷交給
 * `view.endOfTextblock("up")`（ProseMirror 自己給的版面查詢，含軟換行與視覺折行）。
 *
 * ⚠️ **這條路一個字都不改 doc。** 使用者要的是「回去」，Shift+Tab 那條（`block-cycle`）付出的
 * 代價是區塊被轉成對白留在原地 —— 所以環不動，改由方向鍵回答（票券 34）。
 */
import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { sceneContext } from "../address";
import { requestFocus } from "../focus";

export const VerticalNav = Extension.create({
  name: "verticalNav",
  // 壓過 StarterKit／gapcursor 的方向鍵處理。
  priority: 1102,
  addKeyboardShortcuts() {
    return {
      ArrowUp: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!(selection instanceof TextSelection) || !selection.empty) return false;

        const { $from } = selection;
        if (!view.endOfTextblock("up")) return false;

        const ctx = sceneContext($from);
        if (!ctx) return false;

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
      },
    };
  },
});
