import { describe, expect, it } from "vitest";

import { cardMeta } from "./document-card";

describe("hub 卡片上那一行", () => {
  const edited = new Date("2026-10-24T04:00:00Z");

  it("有字：日期與字數", () => {
    expect(cardMeta({ updatedAt: edited, words: 1234 })).toBe("2026年10月24日 · 1,234 字");
  });

  it("還沒有這份文件：尚未開始", () => {
    expect(cardMeta(undefined)).toBe("尚未開始");
  });

  // 票券 71：新專案的兩份大綱一建立就存在 —— 判準是「有沒有字」，不是「存不存在」，新舊專案才一致。
  it("文件在、但一個字都沒有：也是尚未開始", () => {
    expect(cardMeta({ updatedAt: edited, words: 0 })).toBe("尚未開始");
  });

  it("不數字的那一種（劇本）：只有日期", () => {
    expect(cardMeta({ updatedAt: edited })).toBe("2026年10月24日");
  });
});
