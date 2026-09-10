/**
 * 把 chip row 上的 ⌘Z／⌘⇧Z 送回編輯器的歷史。
 *
 * **為什麼要自己送**：Tiptap 的 `NodeView.stopEvent` 把 `INPUT`／`BUTTON`／`SELECT` 上的
 * 鍵盤事件整個攔在 node view 裡（`@tiptap/core`，那是為了讓表單控制項在 contentEditable
 * 裡還能正常打字），ProseMirror 因此**從來收不到**焦點在欄位裡時按的 ⌘Z —— 瀏覽器改用
 * input 自己的原生 undo，表面上就是「按了沒反應」。症狀：新建一個 chip 之後 ⌘Z 要按兩次
 * 才清得掉（使用者回報 2026-09-10；文件那一側只需要一次，`undo-history.test.tsx` 有量過）。
 *
 * **框裡還有沒定案的字時不接手**：那一刻的 ⌘Z 是「撤銷我剛打的那幾個字」，原生 undo 正是
 * 為它而生。框空了（剛把字定案成 chip）才輪到文件 —— 那時編劇要撤的一定是那一筆寫入。
 */
import type { Editor } from "@tiptap/core";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function forwardHistoryKey(editor: Editor, event: ReactKeyboardEvent): boolean {
  if (event.nativeEvent.isComposing) return false; // 組字中的每一顆鍵都還給 IME（§7.6）
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (event.key.toLowerCase() !== "z") return false;

  const target = event.target as HTMLElement | null;
  if (target?.tagName === "INPUT" && (target as HTMLInputElement).value !== "") return false;

  event.preventDefault();
  event.stopPropagation();
  if (event.shiftKey) editor.commands.redo();
  else editor.commands.undo();
  return true;
}
