/**
 * slash 選單的落點（票券 29）。
 *
 * 這支測的是「游標 rect → 選單座標」那段純函式。原本的 bug 測不到：jsdom 沒有排版與捲動，
 * `getBoundingClientRect()` 一律回 0，視窗座標與文件座標剛好重合，正是第一場看起來正常的
 * 那個巧合。把座標運算抽出來之後，捲動與視窗邊界都可以直接餵數字。
 */
import { describe, expect, it } from "vitest";

import { anchoredPosition } from "./anchored-position";

const VIEWPORT = { width: 1200, height: 800 };
const MENU = { width: 240, height: 200 };

/** 視窗座標的游標 rect —— `clientRect()` 給的就是這種。 */
const caret = (left: number, top: number, height = 20) => ({
  left,
  right: left + 1,
  top,
  bottom: top + height,
});

describe("anchoredPosition", () => {
  it("空間夠時開在游標正下方，貼齊游標左緣", () => {
    expect(anchoredPosition(caret(300, 100), MENU, VIEWPORT)).toEqual({ top: 126, left: 300 });
  });

  it("座標是視窗座標，不隨捲動位移 —— 捲到後段的場次也貼著游標", () => {
    // 捲動之後 `clientRect()` 給的 top 仍是相對視窗的（例如 400），選單就該落在 426。
    // 這正是本票的 bug：舊碼是 position: absolute，等於又被加了一次 scrollY。
    expect(anchoredPosition(caret(300, 400), MENU, VIEWPORT)).toEqual({ top: 426, left: 300 });
  });

  it("下方空間不足時翻到游標上方", () => {
    // 游標底 700，往下 200 高會超出 800 的視窗；翻上去是 680 - 6 - 200。
    expect(anchoredPosition(caret(300, 680), MENU, VIEWPORT)).toEqual({ top: 474, left: 300 });
  });

  it("上下都不夠時留在下方、不蓋住錨點，限高到下方剩下的空間（DESIGN.md 規則 3，票券 33）", () => {
    // 780 高的選單上下都放不下；也不往上推 —— 那會蓋住正在打字的欄位。
    // 錨點底 320：下方從 326 開始、扣掉底部 8px 剩 466；上方只有 300 - 6 - 8 = 286。
    const tall = { width: 240, height: 780 };
    expect(anchoredPosition(caret(300, 300), tall, VIEWPORT)).toEqual({
      top: 326,
      left: 300,
      maxHeight: 466,
    });
  });

  it("上下都不夠、而上方空間比較大時開在上方並限高 —— 錨點貼著視窗下緣時，下方根本沒地方", () => {
    // 錨點底 790：下方剩 2，上方有 770 - 6 - 8 = 756。
    const tall = { width: 240, height: 780 };
    expect(anchoredPosition(caret(300, 770), tall, VIEWPORT)).toEqual({
      top: 8,
      left: 300,
      maxHeight: 756,
    });
  });

  it("頁首擋住的那一截不算上方空間 —— 翻上去會壓過頁首時，改開在頁首底下並限高", () => {
    // 頁首 48 高（sticky、一直在）。錨點頂 700：下方只剩 800 - 8 - 726 = 66。
    // 不算頁首的話上方有 700 - 6 - 8 = 686，660 高的面板放得下，會開在 34 —— 壓進頁首。
    // 算進頁首：上方剩 700 - 6 - 48 - 8 = 638，放不下 → 開在頁首底下 48 + 8 = 56、限高 638。
    const panel = { width: 240, height: 660 };
    expect(anchoredPosition(caret(300, 700), panel, { ...VIEWPORT, top: 48 })).toEqual({
      top: 56,
      left: 300,
      maxHeight: 638,
    });
  });

  it("有頁首時，翻上去放得下就照常翻（只是上方空間少算一截）", () => {
    expect(anchoredPosition(caret(300, 680), MENU, { ...VIEWPORT, top: 48 })).toEqual({ top: 474, left: 300 });
  });

  it("接近右緣時往左收，不超出視窗", () => {
    expect(anchoredPosition(caret(1100, 100), MENU, VIEWPORT)).toEqual({ top: 126, left: 952 });
  });

  it("視窗比選單還窄時靠左，不給負座標", () => {
    expect(anchoredPosition(caret(100, 100), MENU, { width: 200, height: 800 })).toEqual({
      top: 126,
      left: 8,
    });
  });

  it("尚未量到尺寸（0×0）時就照游標下方擺，不亂翻", () => {
    expect(anchoredPosition(caret(300, 400), { width: 0, height: 0 }, VIEWPORT)).toEqual({
      top: 426,
      left: 300,
    });
  });
});
