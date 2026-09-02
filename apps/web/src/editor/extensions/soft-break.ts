/**
 * `Shift+Enter` —— 同一區塊內的軟換行（使用者回饋 2026-09-03）。
 *
 * `Enter` 仍交給 ProseMirror 預設 `splitBlock`（切出新區塊）。`Shift+Enter` 在**當前區塊內**
 * 插入一個 `\n` 文字字元 —— 不是 `hardBreak` 節點：kernel schema（`@scenephonie/schema`）
 * 的節點集合刻意不含它，加進來會撐破 schema-equivalence 與 null 鐵律。ProseMirror 預設
 * `white-space: pre-wrap`，`\n` 直接顯示為換行；經 JSON 往返仍是 kernel 的 `text` 節點，
 * 資料模型不需要新增任何東西（已用 `docFromJSON` 往返驗證）。
 *
 * ⚠️ 約束 2（資料模型不含呈現性資訊）：區塊內換行在此視為**編劇寫下的內容結構**（與文字
 * 本身同級），非樣式。若 spec owner 認定它屬呈現層，移除本擴充即可讓 `Shift+Enter` 回到無效。
 */
import { Extension } from "@tiptap/core";

export const SoftBreak = Extension.create({
  name: "softBreak",
  // 壓過 StarterKit 內建對 Shift-Enter 的處理（否則會落到 splitBlock）。
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () =>
        this.editor.commands.command(({ state, tr, dispatch }) => {
          // 只在可放文字的區塊內作用（欄位裡的 Shift+Enter 不會走到這，欄位是 DOM input）。
          if (!state.selection.$from.parent.isTextblock) return false;
          if (dispatch) tr.insertText("\n").scrollIntoView();
          return true;
        }),
    };
  },
});
