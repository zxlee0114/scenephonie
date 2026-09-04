/**
 * 票券 27 —— typewriter scrolling 的落點計算。
 *
 * 純算術，與 DOM 無關：給「元素上緣在視窗的哪裡」＋「目前捲到哪」＋「視窗多高」＋「最多能捲多少」，
 * 算出「要捲到哪」才能讓那個元素停在打字餘裕線上。
 */
import { describe, expect, it } from "vitest";

import { TYPEWRITER_ANCHOR, writingScrollTop } from "./typewriter-scroll";

/** 1000px 高的視窗、可捲動空間充裕 —— 落點不會被夾住的基準情境。 */
const roomy = { viewportHeight: 1000, maxScrollTop: 100_000 };

describe("writingScrollTop", () => {
  it("把元素上緣帶到打字餘裕線（偏上，不是視窗正中）", () => {
    // 元素現在在視窗 900px 處（快貼到底緣），文件已捲了 2000px。
    const top = writingScrollTop({ elementTop: 900, scrollY: 2000, ...roomy });
    // 目標：元素上緣落在 1000 * 0.4 = 400px 處 → 再往下捲 500px。
    expect(top).toBe(2500);
    expect(TYPEWRITER_ANCHOR).toBeLessThan(0.5); // 偏上：下方要留給即將寫出來的內容
  });

  it("元素已經在餘裕線上時不動", () => {
    expect(writingScrollTop({ elementTop: 400, scrollY: 2000, ...roomy })).toBe(2000);
  });

  it("元素在餘裕線之上時往回捲（把它拉回同一條線）", () => {
    expect(writingScrollTop({ elementTop: 100, scrollY: 2000, ...roomy })).toBe(1700);
  });

  it("短劇本：算出來是負的就停在頂端，不做詭異的反向捲動", () => {
    expect(writingScrollTop({ elementTop: 120, scrollY: 0, ...roomy })).toBe(0);
  });

  it("文件根本不能捲時停在 0（maxScrollTop 為負也一樣）", () => {
    expect(
      writingScrollTop({ elementTop: 900, scrollY: 0, viewportHeight: 1000, maxScrollTop: -200 }),
    ).toBe(0);
  });

  it("最後一場：捲不到餘裕線就捲到底，落點由頁尾留白決定（不硬撐）", () => {
    // 想捲到 2500，但整份文件最多只能捲 2300 → 元素停在 600px 處，仍是畫面中段而非底緣。
    const top = writingScrollTop({
      elementTop: 900,
      scrollY: 2000,
      viewportHeight: 1000,
      maxScrollTop: 2300,
    });
    expect(top).toBe(2300);
  });
});
