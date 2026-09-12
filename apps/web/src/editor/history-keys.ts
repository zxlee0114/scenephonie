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

/**
 * 欄位說「這一下歸文件，別看框裡有沒有字」的那些事件（票券 37）。
 *
 * 只有一種情況用得到：⌘Z 把一筆定案撤回來之後，那個名字**是欄位自己塞回框裡的**，不是
 * 編劇打的 —— 那一刻的 ⌘⇧Z 要把那一筆做回去，而「框裡有字就不接手」那條線會擋住它。
 * 判準一步都沒退（沒定案的字歸原生 undo），退的是那串字：它這一刻不是「編劇打了還沒定案
 * 的字」，而是一筆已經撤掉的定案留在框裡的樣子。
 *
 * 標在**原生事件**上而不是 DOM 上：這件事只對這一顆按鍵成立，不是輸入框的一種狀態 ——
 * 寫成狀態就得有人負責清掉它，而那正是 §7.3 否決過的那種看不見的狀態。
 */
const claimed = new WeakSet<KeyboardEvent>();

export function claimHistoryKey(event: ReactKeyboardEvent): void {
  claimed.add(event.nativeEvent);
}

/** 這一顆鍵是在叫歷史嗎（`null` ＝ 不是；組字中的每一顆鍵都還給 IME，§7.6）。 */
export function historyKey(event: ReactKeyboardEvent): "undo" | "redo" | null {
  if (event.nativeEvent.isComposing) return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key.toLowerCase() !== "z") return null;
  return event.shiftKey ? "redo" : "undo";
}

export function forwardHistoryKey(
  editor: Editor,
  event: ReactKeyboardEvent,
): boolean {
  const which = historyKey(event);
  if (!which) return false;

  const target = event.target as HTMLElement | null;
  if (
    target?.tagName === "INPUT" &&
    (target as HTMLInputElement).value !== "" &&
    !claimed.has(event.nativeEvent)
  )
    return false;

  event.preventDefault();
  event.stopPropagation();
  if (which === "redo") editor.commands.redo();
  else editor.commands.undo();
  return true;
}
