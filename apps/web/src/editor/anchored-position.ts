/**
 * 錨定浮層要開在哪裡 —— **全站唯一一支**（DESIGN.md 的 The One Placement Rule）。
 *
 * 原本是 slash 選單專用的 `slashMenuPosition`（票券 29）；票券 33 把它改名搬家，ⓘ 面板、
 * 實體欄選單、待確認面板、組字預覽、命名提示、登場人物提示、內外／時間選單全部走這裡。
 * DOM 那一側（量尺寸、跟著捲動重算）在 `use-anchored-position.ts`。**不要寫第二套。**
 *
 * 純函式，因為這段原本錯得無聲：`clientRect()` 給的是**視窗座標**，而 `.slash-menu` 曾經是
 * `position: absolute`，解析的是**文件座標** —— 兩者差一個 `scrollY`，頁面頂端剛好重合，捲下去
 * 就把選單丟到視窗上緣之外。jsdom 量不到排版，這種錯只有把座標運算獨立出來才守得住。
 *
 * 進來與出去的數字都是視窗座標，配浮層的 `position: fixed`。
 */

/** `getBoundingClientRect()` 用得到的那幾個欄位。 */
export type CaretRect = { top: number; bottom: number; left: number; right: number };
export type Size = { width: number; height: number };

/** 浮層與錨點之間的呼吸。 */
const GAP = 6;
/** 浮層與視窗邊緣之間至少留這麼多，免得看起來像被切掉。 */
export const VIEWPORT_MARGIN = 8;
const MARGIN = VIEWPORT_MARGIN;

/**
 * 預設開在錨點（游標或欄位）下方、貼齊它的左緣；下方塞不下就翻到上方，右邊塞不下就往左收。
 *
 * 上下都塞不下時**不往回推**：推進視窗會蓋住錨點本身 —— 也就是正在打字的那個欄位。改成開在
 * 空間比較大的那一側（通常是下方），並回傳 `maxHeight`：浮層要限高到那一側剩下的空間、自己捲。
 * 放得下時不回傳 `maxHeight`。
 *
 * `menu` 是浮層量到的尺寸（要在**沒有** `maxHeight` 的狀態下量）；還沒量到時傳 0×0，
 * 會退化成單純的「錨點正下方」。
 */
export function anchoredPosition(
  caret: CaretRect,
  menu: Size,
  viewport: Size,
): { top: number; left: number; maxHeight?: number } {
  const below = caret.bottom + GAP;
  const above = caret.top - GAP - menu.height;
  const left = Math.max(MARGIN, Math.min(caret.left, viewport.width - MARGIN - menu.width));

  const roomBelow = viewport.height - MARGIN - below;
  const roomAbove = caret.top - GAP - MARGIN;
  if (menu.height <= roomBelow) return { top: below, left };
  if (menu.height <= roomAbove) return { top: above, left };
  return roomBelow >= roomAbove
    ? { top: below, left, maxHeight: roomBelow }
    : { top: MARGIN, left, maxHeight: roomAbove };
}
