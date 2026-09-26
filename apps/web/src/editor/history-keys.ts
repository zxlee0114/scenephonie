/**
 * 把 ⌘Z／⌘⇧Z 送回編輯器的歷史 —— chip row 上那一格（票券 37），以及**誰都沒接住**那一格
 * （票券 53）。
 *
 * **為什麼要自己送**：Tiptap 的 `NodeView.stopEvent` 把 `INPUT`／`BUTTON`／`SELECT` 上的
 * 鍵盤事件整個攔在 node view 裡（`@tiptap/core`，那是為了讓表單控制項在 contentEditable
 * 裡還能正常打字），ProseMirror 因此**從來收不到**焦點在欄位裡時按的 ⌘Z —— 瀏覽器改用
 * input 自己的原生 undo，表面上就是「按了沒反應」。症狀：新建一個 chip 之後 ⌘Z 要按兩次
 * 才清得掉（使用者回報 2026-09-10；文件那一側只需要一次，`undo-history.test.tsx` 有量過）。
 *
 * **框裡還有沒定案的字時不接手**：那一刻的 ⌘Z 是「撤銷我剛打的那幾個字」，原生 undo 正是
 * 為它而生。框空了（剛把字定案成 chip）才輪到文件 —— 那時編劇要撤的一定是那一筆寫入。
 *
 * ── 焦點誰都沒接住的那一格（票券 53）─────────────────────────────────
 * `forwardHistoryKey` 掛在 chip row 與對白人物欄上，收得到的只有「焦點還在欄位裡」。編劇
 * 拿起一批群演、把字刪光、**點到一塊誰都接不住的空白**放手之後，焦點掉到 `body`，那顆鍵
 * 於是歸瀏覽器 —— 而瀏覽器對剛剛被清空的 `<input>` 做的是原生 undo：把刪掉的字整串反白
 * 塞回框裡。回來的不是那一批群演（`extraId` 與人數都在），是一串裸字，再定案一次就是新的
 * 一批、人數重新猜（使用者回報 2026-09-12）。
 *
 * `strayHistoryKey` 是那一格的退路：這一下誰都沒接住時，它歸文件。判準與上面**逐字同一
 * 條**（框裡有編劇沒定案的字就不接手），問的也仍然是**事件的 target** —— 瀏覽器把 keydown
 * 派給誰，那顆鍵就先歸誰，焦點掉到 `body` 時 target 就是 `body`。不去問
 * `document.activeElement` 是因為那是**另一個**問題（「現在焦點在哪」），兩者在真的按鍵上
 * 一致、在程式派發的事件上不一致，而這裡要的一直是前者。票券 37 的「焦點不在就只讓文件退，
 * 欄位不插手」在這裡原封成立，
 * 欄位一個字都不會被塞。
 *
 * 掛在 window 而不是編輯器那塊 DOM 上：焦點掉到 `body` 的事件根本到不了編輯器（同
 * `ScreenplayEditor` 的零場次面板，它為了同一個理由也掛在 window）。
 */
import { Extension, type Editor } from "@tiptap/core";
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
function nativeHistoryKey(event: KeyboardEvent): "undo" | "redo" | null {
  if (event.isComposing) return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key.toLowerCase() !== "z") return null;
  return event.shiftKey ? "redo" : "undo";
}

export function historyKey(event: ReactKeyboardEvent): "undo" | "redo" | null {
  return nativeHistoryKey(event.nativeEvent);
}

/**
 * 一個輸入框**自己的**原生歷史還剩多少（票券 54 驗收回饋，2026-09-27）。
 *
 * 裁決是「框裡的 ⌘Z 只在那個框自己的歷史裡走，框空了就到底」。第一版以為交給原生 undo
 * 就做得到 —— 錯了：**Chrome／Safari 的原生堆疊是整份頁面共用一條**，不是每個框一份。框
 * 自己的編輯退光之後再按，退的是**別的框**上一刻的編輯，焦點還跟著跳過去。人工驗收撈到的：
 * 群演欄握著一批、清空、⌘Z 三下、⌘⇧Z 一下 —— 人物欄冒出 `小明小明`，游標停在那裡。
 *
 * 於是這本帳回答一件事：**這一下原生 undo／redo 還會不會停在這個框裡**。
 *
 * - **undo**：從 `start` 那一刻起編劇動過這個框，而且框裡的字還不是起點的樣子。起點那串
 *   字是程式塞的（拿起一筆、進人數格），不在原生堆疊裡 —— 退回起點就表示這個框自己的那幾
 *   步退光了，再下去就是別人的。不去數「退了幾步」：瀏覽器會把連打的字併成一步，數不準。
 * - **redo**：只做回剛剛放行過的那幾步。這一側數得準 —— 一次 undo 就是一步，一次 redo 也是。
 *
 * 保守的那一格：動過之後又改回起點一模一樣的字，undo 就不放行了（堆疊裡其實還有這個框的
 * 步驟）。寧可少退一步，也不要退到別的欄位去。
 */
export interface OwnHistory {
  /** 從這裡開始算這個框自己的歷史 —— 拿起一筆、進人數格、從人數格回來。 */
  start(value: string): void;
  /** 框裡的字被改了（`onChange` 的原生事件）。原生 undo／redo 自己造成的那一次不算。 */
  typed(event: Event): void;
  /** 這一下放不放給原生處理。放的話順手記帳（`value` ＝ 按下去之前框裡的字）。 */
  allows(which: "undo" | "redo", value: string): boolean;
}

export function ownHistory(): OwnHistory {
  let baseline = "";
  let edited = false;
  let redoable = 0;
  return {
    start(value) {
      baseline = value;
      edited = false;
      redoable = 0;
    },
    typed(event) {
      const kind = (event as InputEvent).inputType;
      if (kind === "historyUndo" || kind === "historyRedo") return;
      edited = true;
      redoable = 0; // 撤銷之後又打字，原生堆疊的 redo 那一串就作廢了
    },
    allows(which, value) {
      if (which === "redo") {
        if (redoable === 0) return false;
        redoable -= 1;
        return true;
      }
      if (!edited || value === baseline) return false;
      redoable += 1;
      return true;
    },
  };
}

/**
 * 把一顆歷史鍵**留在這個框裡**（票券 48、54）：不往上冒（chip row、window 的
 * `strayHistoryKey`），框自己的歷史還有東西就交給原生 undo／redo，到底了就擋掉
 * （`preventDefault`）—— 否則原生那一下會退到別的框去（見 `ownHistory`）。
 *
 * 呼叫端**不要**再把這顆鍵交給 `onKeyDown`：對白人物欄的 ⌘Z 走的是那條 prop（`blocks.tsx`），
 * 交出去就等於沒擋。
 */
export function keepHistoryInBox(
  event: ReactKeyboardEvent<HTMLInputElement>,
  box: OwnHistory,
): void {
  const which = historyKey(event);
  if (!which) return;
  event.stopPropagation();
  if (!box.allows(which, event.currentTarget.value)) event.preventDefault();
}

/**
 * 這一下**還握在某個輸入框手上**嗎 —— 框裡有編劇打了還沒定案的字（見檔頭第二段）。
 *
 * 兩個入口問的是**同一個東西**（事件的 target），差別只在誰先收到那顆鍵：`forwardHistoryKey`
 * 在 chip row 上，`strayHistoryKey` 在 window 上。
 *
 * ⚠️ 它答不出「這一欄手上握著東西嗎」—— 那個狀態住在欄位元件的 ref 裡，這一層看不到。
 * 握著一筆時空框那一下若流到這裡，文件會把「剛拿起它」那一步退回來，同一筆變成兩份。
 * 所以那一格由欄位自己在前面攔下（`keepHistoryInBox`，見 `EntityField`／`ExtrasField` 的
 * `handleKeyDown`，票券 54），根本到不了這裡。
 */
function typingInField(el: Element | null, event: KeyboardEvent): boolean {
  return (
    el?.tagName === "INPUT" &&
    (el as HTMLInputElement).value !== "" &&
    !claimed.has(event)
  );
}

export function forwardHistoryKey(
  editor: Editor,
  event: ReactKeyboardEvent,
): boolean {
  const which = historyKey(event);
  if (!which) return false;

  if (typingInField(event.target as Element | null, event.nativeEvent))
    return false;

  event.preventDefault();
  event.stopPropagation();
  if (which === "redo") editor.commands.redo();
  else editor.commands.undo();
  return true;
}

/**
 * 焦點誰都沒接住時，那一下歸文件（票券 53）—— 見檔頭第三段。
 *
 * 四種情況**不接手**，而它們都是「已經有人在管這一顆鍵了」：
 *
 * 1. 上游已經 `preventDefault`（chip row 的 `forwardHistoryKey`、零場次面板）；
 * 2. 這一下派在某個 contentEditable 上 —— 那是 ProseMirror 自己的 keymap，接手會退兩步；
 * 3. 派在一個還裝著編劇沒定案的字的框上（`typingInField`，與 `forwardHistoryKey` 同一條線）；
 * 4. 派在編輯器以外的東西上 —— ⌘Z 是全域的，別人的欄位不歸這份稿子管。
 *
 * 零場次另外擋一層：那個狀態下 contenteditable 是關的、⌘Z 的合約整條寫在
 * `ScreenplayEditor` 的空狀態面板裡（它也掛在 window）。兩邊同時接會一次退兩步。
 */
export function strayHistoryKey(editor: Editor, event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  const which = nativeHistoryKey(event);
  if (!which) return false;
  if (editor.isDestroyed || editor.state.doc.childCount === 0) return false;

  // 事件派到誰身上，那一顆鍵就先歸誰 —— 焦點掉到 `body`（或整個文件）時才是「沒人接住」。
  // 收在 `Element` 而不是 `HTMLElement`：後者會把一個聚焦中的 SVG 當成「沒人接住」，
  // 那不是同一件事（今天 `src/` 裡沒有 SVG 內容，但這條線不該靠那個成立）。
  const owner = event.target instanceof Element ? event.target : null;
  const loose =
    owner == null ||
    owner === document.body ||
    owner === document.documentElement;
  if (!loose) {
    if (!editor.view.dom.contains(owner)) return false;
    if (owner instanceof HTMLElement && owner.isContentEditable) return false;
    if (typingInField(owner, event)) return false;
  }

  // `preventDefault` 同時是這張票的另一半：擋掉瀏覽器對那個空輸入框的原生 undo，
  // 不然那串裸字還是會被塞回框裡。
  event.preventDefault();
  if (which === "redo") editor.commands.redo();
  else editor.commands.undo();
  return true;
}

/** 把 `strayHistoryKey` 掛上 window，活得跟 editor 一樣久。 */
export const StrayHistoryKey = Extension.create({
  name: "strayHistoryKey",
  onCreate() {
    const editor = this.editor;
    const listener = (event: KeyboardEvent) => strayHistoryKey(editor, event);
    this.storage.listener = listener;
    window.addEventListener("keydown", listener);
  },
  onDestroy() {
    const listener = this.storage.listener as
      | ((event: KeyboardEvent) => void)
      | undefined;
    if (listener) window.removeEventListener("keydown", listener);
  },
});
