/**
 * slash 選單的落點（票券 29）。
 *
 * 這支測的是「游標 rect → 選單座標」那段純函式。原本的 bug 測不到：jsdom 沒有排版與捲動，
 * `getBoundingClientRect()` 一律回 0，視窗座標與文件座標剛好重合，正是第一場看起來正常的
 * 那個巧合。把座標運算抽出來之後，捲動與視窗邊界都可以直接餵數字。
 */
import { describe, expect, it } from "vitest";

import { slashMenuPosition } from "./slash-menu-position";

const VIEWPORT = { width: 1200, height: 800 };
const MENU = { width: 240, height: 200 };

/** 視窗座標的游標 rect —— `clientRect()` 給的就是這種。 */
const caret = (left: number, top: number, height = 20) => ({
  left,
  right: left + 1,
  top,
  bottom: top + height,
});

describe("slashMenuPosition", () => {
  it("空間夠時開在游標正下方，貼齊游標左緣", () => {
    expect(slashMenuPosition(caret(300, 100), MENU, VIEWPORT)).toEqual({ top: 126, left: 300 });
  });

  it("座標是視窗座標，不隨捲動位移 —— 捲到後段的場次也貼著游標", () => {
    // 捲動之後 `clientRect()` 給的 top 仍是相對視窗的（例如 400），選單就該落在 426。
    // 這正是本票的 bug：舊碼是 position: absolute，等於又被加了一次 scrollY。
    expect(slashMenuPosition(caret(300, 400), MENU, VIEWPORT)).toEqual({ top: 426, left: 300 });
  });

  it("下方空間不足時翻到游標上方", () => {
    // 游標底 700，往下 200 高會超出 800 的視窗；翻上去是 680 - 6 - 200。
    expect(slashMenuPosition(caret(300, 680), MENU, VIEWPORT)).toEqual({ top: 474, left: 300 });
  });

  it("上下都不夠時仍留在下方，並夾在視窗內", () => {
    // 780 高的選單，上方（-386）根本放不下，就別翻；改把它往上推到底緣仍在視窗內的位置。
    const tall = { width: 240, height: 780 };
    expect(slashMenuPosition(caret(300, 400), tall, VIEWPORT)).toEqual({ top: 12, left: 300 });
  });

  it("選單比視窗還高時貼上緣，不給負座標", () => {
    const tooTall = { width: 240, height: 900 };
    expect(slashMenuPosition(caret(300, 400), tooTall, VIEWPORT)).toEqual({ top: 8, left: 300 });
  });

  it("接近右緣時往左收，不超出視窗", () => {
    expect(slashMenuPosition(caret(1100, 100), MENU, VIEWPORT)).toEqual({ top: 126, left: 952 });
  });

  it("視窗比選單還窄時靠左，不給負座標", () => {
    expect(slashMenuPosition(caret(100, 100), MENU, { width: 200, height: 800 })).toEqual({
      top: 126,
      left: 8,
    });
  });

  it("尚未量到尺寸（0×0）時就照游標下方擺，不亂翻", () => {
    expect(slashMenuPosition(caret(300, 400), { width: 0, height: 0 }, VIEWPORT)).toEqual({
      top: 426,
      left: 300,
    });
  });
});
