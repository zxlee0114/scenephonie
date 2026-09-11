/**
 * 欄位**裡面**的方向鍵 —— chip 之間怎麼走（票券 34，使用者驗收回饋 2026-09-10 第三輪）。
 *
 * 地點、登場人物、群演這三格各自可以裝下好幾筆。原本 ←→ 只有兩種答案：在字裡走，或者
 * 貼著端點時跳去隔壁那一格 —— 已經定案成 chip 的那幾筆是**跳不進去**的，只能靠滑鼠點，
 * 或者一路 Backspace 把它們一個一個拆回文字。
 *
 * ```
 * [👤 小明] [👤 小華] [👤 阿姨] |輸入框
 *     ↑ ←—— ↑ ←——— ↑ ←———————— ←
 *     └ 再往左才離開這一格（交給 chip row 的格線導航）
 * ```
 *
 * - `←` 從輸入框的字首退進**左邊那一個** chip，再往左**一格一格**走：chip、chip 左邊那道
 *   縫（游標插進去）、再左邊那個 chip⋯⋯ 第一個 chip 再往左才出這一格。
 * - `→` 反向走回來，一樣是 chip 與縫交替。
 * - `⌘←`／`⌘→` 直接到這一格的最前（第一個 chip）／最後（輸入框排到隊尾、游標到字尾）。
 * - `↑↓` 不歸這裡 —— 那是 chip row 的格線導航，原封交回呼叫端。
 *
 * 「縫也是一站」要有 `moveCaret` 才成立（實體欄位有，群演欄沒有）—— 沒給就只在 chip
 * 之間跳，輸入框永遠在隊尾。
 *
 * ⚠️ **只有輸入框空著時 ← 才退得進 chip**（`⌘←` 同）。理由是離開輸入框會 blur，而 blur 會把
 * 打到一半的字定案成新的 chip —— 那一刻整排的序就變了，剛剛算好的「最後一個」指向別人。
 * 有字沒定案時 ←／⌘← 照原生走（回到字首），字定案之後才輪到這條路。這與 Backspace 的
 * 「空欄位才把最後一筆拿下來」是同一條線。
 *
 * chip 都是 `tabIndex={-1}`：焦點只能用方向鍵走進去，**Tab 序一個字都沒改**（§7.3 的環）。
 */
"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

type Options = {
  /** 這一格現在有幾個 chip。 */
  count: number;
  /**
   * 輸入框**排在第幾格**（`0` ＝ 所有 chip 之前，`count` ＝ 全部之後，也就是平常的樣子）。
   *
   * 拿起來改的那一筆會把輸入框留在它原本的位置（票券 39 收票），所以「輸入框左邊那一個」
   * 不一定是最後一個 chip。←／→ 要走的是**看得見的順序**，不是陣列的尾端。
   */
  home?: number;
  /** 這一格的輸入框。 */
  input: RefObject<HTMLInputElement | null>;
  /** 輸入框裡打到一半的字（空字串才進得了 chip —— 見檔頭）。 */
  text: string;
  /** 第一個 chip 再往左、或 chip 上的 ↑↓ —— 原封交回呼叫端（chip row 的格線導航）。 */
  exit: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /** 把第 `index` 個 chip 拿下來重編輯（Enter／Backspace，與滑鼠點它同一條路）。 */
  edit: (index: number) => void;
  /**
   * 把輸入框（游標）挪到第 `at` 格 —— chip 之間那道縫也是方向鍵的一站（票券 39 收票）。
   *
   * 沒給就沒有這一站：`←` 從一個 chip 直接跳到左邊那一個（群演欄就是這樣，它的輸入框
   * 永遠在隊尾）。
   */
  moveCaret?: (at: number) => void;
};

export function useChipCaret({ count, home = count, input, text, exit, edit, moveCaret }: Options) {
  const chips = useRef<(HTMLElement | null)[]>([]);
  chips.current.length = count;

  const focusChip = (i: number) => chips.current[i]?.focus();

  const focusInput = (where: "start" | "end") => {
    const el = input.current;
    if (!el) return;
    el.focus();
    const at = where === "end" ? el.value.length : 0;
    el.setSelectionRange(at, at);
  };

  /** 輸入框那一側。回傳 `true` ＝ 這顆鍵已經用掉了，呼叫端不必再處理。 */
  const inputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): boolean => {
    if (count === 0 || text !== "") return false;
    const el = event.currentTarget;
    // 有反白就不是「貼著字首」——那一刻的 ← 是收起反白。
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

    if (event.key === "ArrowLeft" && (event.metaKey ? true : atStart)) {
      if (!event.metaKey && home === 0) return false; // 輸入框已經在最前面，左邊沒有 chip
      event.preventDefault();
      event.stopPropagation();
      focusChip(event.metaKey ? 0 : home - 1);
      return true;
    }
    // → 從輸入框走進**右邊那一個** chip（輸入框夾在中間時才有右邊那一個）。
    if (event.key === "ArrowRight" && !event.metaKey && atEnd && home < count) {
      event.preventDefault();
      event.stopPropagation();
      focusChip(home);
      return true;
    }
    return false;
  };

  /** 游標插進第 `at` 格那道縫 —— 沒有 `moveCaret` 就沒有這一站（見檔頭）。 */
  const toGap = (at: number) => {
    if (!moveCaret) return false;
    moveCaret(at);
    focusInput("start");
    return true;
  };

  /** 一個 chip 那一側。 */
  const chipKeyDown = (i: number, event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;

    switch (event.key) {
      case "ArrowLeft":
        if (event.metaKey) break; // 落到下面的 ⌘ 分支
        event.stopPropagation();
        // 先走進這一顆**左邊那道縫**（游標插進去），再按一次才輪到左邊那一顆 chip。
        // 已經站在那道縫上（輸入框就在左邊）就直接跳過去 —— 同一站不走兩次。
        if (i !== home && toGap(i)) {
          event.preventDefault();
          return;
        }
        if (i === 0) return exit(event); // 這一格到頭了 —— 換 chip row 的格線接手
        event.preventDefault();
        return focusChip(i - 1);
      case "ArrowRight":
        if (event.metaKey) break;
        event.preventDefault();
        event.stopPropagation();
        // 同理往右：先是這一顆右邊那道縫，再按一次才是右邊那一顆。
        if (i + 1 !== home && toGap(i + 1)) return;
        // 輸入框夾在中間時，走到它左邊那一個就該進框裡（看得見的順序）。
        if (i + 1 === home) return focusInput("start");
        return i === count - 1 ? focusInput("start") : focusChip(i + 1);
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        return edit(i); // 與滑鼠點它一樣：字回到輸入框、整串反白
      case "Backspace":
      case "Delete":
        event.preventDefault();
        event.stopPropagation();
        return edit(i); // 整串反白 —— 再按一次就一起刪掉（同空欄位上的 Backspace）
      case "ArrowUp":
      case "ArrowDown":
        return exit(event); // 上下不歸這裡：那是 chip row 的格線導航
      default:
        break;
    }

    if (event.metaKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowLeft") focusChip(0);
      else {
        moveCaret?.(count); // ⌘→ ＝ 這一格的最後：輸入框也排回隊尾
        focusInput("end");
      }
    }
  };

  /** 掛在每一個 chip 上。`tabIndex={-1}` ＝ 走得進去，但不進 Tab 序。 */
  const chipProps = (i: number) => ({
    tabIndex: -1,
    ref: (el: HTMLElement | null) => {
      chips.current[i] = el;
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => chipKeyDown(i, event),
  });

  return { chipProps, inputKeyDown };
}
