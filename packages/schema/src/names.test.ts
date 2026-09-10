/**
 * 多值欄位的輸入規則（§4.7）。這一份規則同時是地點欄、登場人物欄與貼上解析的權威。
 */
import { describe, expect, it } from "vitest";

import { hasSeparator, splitNames, splitNamesLive } from "./names";

describe("splitNames：標點是分隔符，空白不是", () => {
  it.each(["、", "，", ",", "；", ";"])("「%s」切開名字", (sep) => {
    expect(splitNames(`小明${sep}小華`)).toEqual(["小明", "小華"]);
  });

  it("半形空白留在名字裡（不切開）", () => {
    expect(splitNames("海豚 公寓房間")).toEqual(["海豚 公寓房間"]);
  });

  it("全形空白也留在名字裡", () => {
    expect(splitNames("海豚　公寓房間")).toEqual(["海豚　公寓房間"]);
  });

  it("名字兩端的空白不是名字的一部分", () => {
    expect(splitNames("小明 、 小華")).toEqual(["小明", "小華"]);
  });

  it("空段落不產生空 chip", () => {
    expect(splitNames("小明、、小華、")).toEqual(["小明", "小華"]);
    expect(splitNames("  ")).toEqual([]);
  });

  it("貼上一整串走同一份規則", () => {
    expect(splitNames("小明，小華; 陳 老師")).toEqual(["小明", "小華", "陳 老師"]);
  });
});

describe("splitNamesLive：分隔符之前的定案，最後一段還在打", () => {
  it("打到分隔符的那一刻，前面的切成 chip", () => {
    expect(splitNamesLive("小明、")).toEqual({ names: ["小明"], rest: "" });
  });

  it("還沒打分隔符 → 什麼都不定案", () => {
    expect(splitNamesLive("小明")).toEqual({ names: [], rest: "小明" });
  });

  it("最後一段原封不動留在欄位裡（尾端空白可能是下一個字的一部分，不 trim）", () => {
    expect(splitNamesLive("小明、小 ")).toEqual({ names: ["小明"], rest: "小 " });
  });
});

describe("hasSeparator", () => {
  it("有標點才算多值輸入", () => {
    expect(hasSeparator("小明、小華")).toBe(true);
    expect(hasSeparator("海豚 公寓房間")).toBe(false);
  });
});
