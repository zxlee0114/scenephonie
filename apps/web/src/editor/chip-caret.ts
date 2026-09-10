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
 * - `←` 從輸入框的字首退進**最後一個** chip，再往左一個一個退，第一個再往左才出這一格。
 * - `→` 反向走回來，最後一個 chip 再往右回到輸入框的**字首**（字就接在 chip 後面）。
 * - `⌘←`／`⌘→` 直接到這一格的最前（第一個 chip）／最後（輸入框字尾）。
 * - `↑↓` 不歸這裡 —— 那是 chip row 的格線導航，原封交回呼叫端。
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
  /** 這一格的輸入框。 */
  input: RefObject<HTMLInputElement | null>;
  /** 輸入框裡打到一半的字（空字串才進得了 chip —— 見檔頭）。 */
  text: string;
  /** 第一個 chip 再往左、或 chip 上的 ↑↓ —— 原封交回呼叫端（chip row 的格線導航）。 */
  exit: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /** 把第 `index` 個 chip 拿下來重編輯（Enter／Backspace，與滑鼠點它同一條路）。 */
  edit: (index: number, selectAll: boolean) => void;
};

export function useChipCaret({ count, input, text, exit, edit }: Options) {
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

    if (event.key === "ArrowLeft" && (event.metaKey ? true : atStart)) {
      event.preventDefault();
      event.stopPropagation();
      focusChip(event.metaKey ? 0 : count - 1);
      return true;
    }
    return false;
  };

  /** 一個 chip 那一側。 */
  const chipKeyDown = (i: number, event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;

    switch (event.key) {
      case "ArrowLeft":
        if (event.metaKey) break; // 落到下面的 ⌘ 分支
        event.stopPropagation();
        if (i === 0) return exit(event); // 這一格到頭了 —— 換 chip row 的格線接手
        event.preventDefault();
        return focusChip(i - 1);
      case "ArrowRight":
        if (event.metaKey) break;
        event.preventDefault();
        event.stopPropagation();
        return i === count - 1 ? focusInput("start") : focusChip(i + 1);
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        return edit(i, false); // 與滑鼠點它一樣：字回到輸入框，游標留在字尾
      case "Backspace":
      case "Delete":
        event.preventDefault();
        event.stopPropagation();
        return edit(i, true); // 整串反白 —— 再按一次就一起刪掉（同空欄位上的 Backspace）
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
      else focusInput("end");
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
