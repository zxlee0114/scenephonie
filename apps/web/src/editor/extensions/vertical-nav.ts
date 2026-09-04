/**
 * 方向鍵的垂直動線 —— 把對白的人物欄接回文件（§7.1 焦點串接，使用者回饋 2026-09-04）。
 *
 * 人物欄是一顆 DOM `<input>`，不在 ProseMirror 的位置空間裡，所以「台詞第一行按 ↑ 應該回到
 * 人名欄補填」這件事沒有人會自動做。這裡補上文件側的那一半：台詞 → 人物欄。
 * 反向（人物欄 → 台詞 ／ 上一個區塊）在 node view 自己的 `onKeyDown`（`nodes/blocks`），
 * 因為那顆鍵根本不會進到 ProseMirror。
 *
 * 只有游標**已經在第一行**時才跳欄 —— 多行台詞裡的 ↑ 仍然是一般的行間移動。判斷交給
 * `view.endOfTextblock("up")`（ProseMirror 自己給的版面查詢，含軟換行與視覺折行）。
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
        if ($from.parent.type.name !== "dialogue") return false;
        if (!view.endOfTextblock("up")) return false;

        const ctx = sceneContext($from);
        if (!ctx) return false;

        // 這個對白的 node view 已經掛著了 —— 它訂閱了 focus 請求，收到就把 DOM 焦點移進人物欄。
        requestFocus({ kind: "speaker", sceneId: ctx.sceneId, blockIndex: ctx.blockIndex });
        return true;
      },
    };
  },
});
