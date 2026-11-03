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

/** 選單與游標之間的呼吸。 */
const GAP = 6;
/** 選單與視窗邊緣之間至少留這麼多，免得看起來像被切掉。 */
const MARGIN = 8;

/**
 * 預設開在錨點（游標或欄位）下方、貼齊它的左緣；下方塞不下就翻到上方，右邊塞不下就往左收。
 *
 * `menu` 是選單量到的尺寸；還沒量到時傳 0×0，會退化成單純的「游標正下方」。
 */
export function anchoredPosition(
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
