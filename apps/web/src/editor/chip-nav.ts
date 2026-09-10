/**
 * chip row 一格**離開這一格**的那幾顆鍵（票券 34）—— 格線導航、Enter 往下一格、⌘↑↓ 的出口。
 *
 * chip row 在畫面上是二維的（`editor.css` 那條 `flex: 1 0 100%`，使用者回饋 2026-09-06）：
 *
 * ```
 * 第 1 排  [內外] [時間] [地點——————————]
 * 第 2 排  [登場人物——————————————————]
 * 第 3 排  [群演————————————————————]
 * ```
 *
 * 方向鍵在這一排的意思就是**移到隔壁那一格**，走到邊界才越界（上一場內文末端／本場內文）。
 * 每一格的鄰居由 `nodes/scene` 決定，這裡只負責「這顆鍵算不算已經走到這一格的邊緣」。
 *
 * 三種 target，同一套規則：
 * - `<input>`（地點／登場人物／群演）：`←→` 要游標**貼著字首／字尾**且沒有反白才跳格。
 * - `<button>`（內外／時間下拉）：沒有游標，`←→` 直接跳（見 `./chip-select`）。
 * - 一個 **chip**：也沒有游標。欄位裡面的 chip 走完了才會把鍵轉交過來（見 `./chip-caret`）。
 *
 * `Enter` ＝ **這一格好了，去下一格**（使用者回饋 2026-09-10 第三輪）。在輸入框那三格，
 * 還有字沒定案時 Enter 先把字切成 chip（欄位自己吃掉），空欄位的 Enter 才輪到這裡 ——
 * 所以使用者感覺到的是「chip 確認後再按一次 Enter 就換一格」。
 *
 * `⌘↑`／`⌘↓` ＝ **一路走到底**：不管現在在哪一格，直接離開整排 —— ⌘↓ 進本場內文、
 * ⌘↑ 回上一場內文末端。與欄位裡的 `⌘←`／`⌘→`（走到這一格的最前／最後，`./chip-caret`）
 * 同一個心智模型：⌘ ＋ 方向 ＝ 這個方向上走到不能再走。
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * chip row 一格的鄰居與出口。沒填的方向就原封還給瀏覽器。
 *
 * 回傳 `false` ＝「這個方向這一刻沒有去處」（第一場沒有上一場可去），那顆鍵一樣原封還回去
 * —— 攔了卻什麼都不做，使用者看到的是「按了沒反應」，比讓瀏覽器捲一下畫面更糟。
 */
export type ChipNav = {
  readonly left?: () => boolean;
  readonly right?: () => boolean;
  readonly up?: () => boolean;
  readonly down?: () => boolean;
  /** `⌘↓` —— 從任一格直接進本場內文。 */
  readonly exitDown?: () => boolean;
  /** `⌘↑` —— 從任一格直接回上一場內文末端。 */
  readonly exitUp?: () => boolean;
};

/**
 * 游標貼著這一格的字首／字尾了嗎。
 *
 * `<button>` 與 chip 沒有游標，一律算兩端都貼著 —— 它們本來就沒有「還有字要讀」這件事。
 */
export function fieldEdge(el: HTMLElement): { atStart: boolean; atEnd: boolean } {
  if (!(el instanceof HTMLInputElement)) return { atStart: true, atEnd: true };
  const { selectionStart: start, selectionEnd: end, value } = el;
  // 有反白就不是「貼著端點」——那一刻的 ←→ 是收起反白，屬於這串字。
  const collapsed = start !== null && start === end;
  return { atStart: collapsed && start === 0, atEnd: collapsed && start === value.length };
}

export const chipNavHandler =
  (to: ChipNav) =>
  (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (e.nativeEvent.isComposing) return;

    const fire = (go: () => boolean) => {
      if (go() === false) return;
      e.preventDefault();
      // 別讓它冒泡到 .ProseMirror 被 keymap 再當成一次文件裡的游標移動。
      e.stopPropagation();
    };

    // ⌘ ＋ 上下 ＝ 直接離開整排。⌘ ＋ 左右不歸這裡（那是欄位裡面的事，見 `./chip-caret`），
    // 沒被欄位吃掉就原封還給瀏覽器 —— 在輸入框裡它本來就是「跳到字首／字尾」。
    if (e.metaKey || e.ctrlKey) {
      const go = e.key === "ArrowDown" ? to.exitDown : e.key === "ArrowUp" ? to.exitUp : undefined;
      if (go) fire(go);
      return;
    }

    // Tab 與 Enter 同一個終點，差別只在它們不看游標在哪 —— 兩顆本來就是「這一格結束了」。
    if ((e.key === "Tab" && !e.shiftKey) || e.key === "Enter") {
      if (to.right) fire(to.right);
      return;
    }

    const { atStart, atEnd } = fieldEdge(e.currentTarget);
    const go =
      e.key === "ArrowUp"
        ? to.up
        : e.key === "ArrowDown"
          ? to.down
          : e.key === "ArrowLeft"
            ? atStart
              ? to.left
              : undefined
            : e.key === "ArrowRight"
              ? atEnd
                ? to.right
                : undefined
              : undefined;
    if (go) fire(go);
  };
