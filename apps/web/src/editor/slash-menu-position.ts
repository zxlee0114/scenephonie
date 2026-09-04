/**
 * slash 選單要開在哪裡（票券 29）。
 *
 * 純函式，因為這段原本錯得無聲：`clientRect()` 給的是**視窗座標**，而 `.slash-menu` 曾經是
 * `position: absolute`，解析的是**文件座標** —— 兩者差一個 `scrollY`，頁面頂端剛好重合，捲下去
 * 就把選單丟到視窗上緣之外。jsdom 量不到排版，這種錯只有把座標運算獨立出來才守得住。
 *
 * 進來與出去的數字都是視窗座標，配 `.slash-menu` 的 `position: fixed`。
 */

/** `getBoundingClientRect()` 用得到的那幾個欄位。 */
export type CaretRect = { top: number; bottom: number; left: number; right: number };
export type Size = { width: number; height: number };

/** 選單與游標之間的呼吸。 */
const GAP = 6;
/** 選單與視窗邊緣之間至少留這麼多，免得看起來像被切掉。 */
const MARGIN = 8;

/**
 * 預設開在游標下方、貼齊游標左緣；下方塞不下就翻到上方，右邊塞不下就往左收。
 *
 * `menu` 是選單量到的尺寸；還沒量到時傳 0×0，會退化成單純的「游標正下方」。
 */
export function slashMenuPosition(
  caret: CaretRect,
  menu: Size,
  viewport: Size,
): { top: number; left: number } {
  const below = caret.bottom + GAP;
  const above = caret.top - GAP - menu.height;
  // 翻上去要真的有空間才翻 —— 上下都不夠時留在下方，再夾進視窗，總比往上壓到看不見好。
  const flip = below + menu.height > viewport.height - MARGIN && above >= MARGIN;
  const top = flip ? above : Math.min(below, Math.max(MARGIN, viewport.height - MARGIN - menu.height));

  const left = Math.max(MARGIN, Math.min(caret.left, viewport.width - MARGIN - menu.width));

  return { top, left };
}
