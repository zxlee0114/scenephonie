/**
 * 多值欄位的輸入規則（§4.7）。這一份規則同時是地點欄、登場人物欄與貼上解析的權威。
 */
import { describe, expect, it } from "vitest";

import { hasDialogueMark, hasSeparator, parseNameDraft, readsLikeSpeech, splitNames } from "./names";

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

describe("parseNameDraft：Enter 那一下整串解析，最後一段交給選單（票券 82）", () => {
  it("分隔符之前的各段是名字，最後一段是正在打的那段", () => {
    expect(parseNameDraft("阿盈、建")).toEqual({ names: ["阿盈"], last: "建" });
  });

  it("還沒打分隔符 → 整串都是最後一段", () => {
    expect(parseNameDraft("小明")).toEqual({ names: [], last: "小明" });
  });

  it("最後一段原封不動（尾端空白可能是下一個字的一部分，不 trim）", () => {
    expect(parseNameDraft("小明、小 ")).toEqual({ names: ["小明"], last: "小 " });
  });

  it("以分隔符收尾 → 最後一段是空的", () => {
    expect(parseNameDraft("你不說話，")).toEqual({ names: ["你不說話"], last: "" });
  });

  it("三欄同一套分隔符：「阿盈，建鳴」是兩個人", () => {
    expect(parseNameDraft("阿盈，建鳴；小八")).toEqual({ names: ["阿盈", "建鳴"], last: "小八" });
  });
});

describe("hasDialogueMark：分隔符以外的台詞標點（票券 82）", () => {
  it.each(["。", "？", "！", "…", "—", "「", "」", "："])("「%s」是台詞標點", (mark) => {
    expect(hasDialogueMark(`你不說話${mark}`)).toBe(true);
  });

  it("分隔符不算 —— 「阿盈，建鳴」仍是兩個人名", () => {
    expect(hasDialogueMark("阿盈，建鳴、小八；吉伊")).toBe(false);
  });

  it("沒有標點的人名", () => {
    expect(hasDialogueMark("海豚 公寓房間")).toBe(false);
  });
});

describe("readsLikeSpeech：沒有台詞標點的一段讀起來像句子嗎（票券 82 驗收）", () => {
  it.each(["我就當你答應了", "你不說話", "妳先走", "您請坐", "這件事情不能說"])("「%s」像句子", (segment) => {
    expect(readsLikeSpeech(segment)).toBe(true);
  });

  it.each(["阿盈", "建鳴", "小八", "老闆娘", "王大明叔"])("「%s」像人名", (segment) => {
    expect(readsLikeSpeech(segment)).toBe(false);
  });

  it("長度數的是字，不是 UTF-16 單位（罕用字不會讓四個字的名字變成五個）", () => {
    expect(readsLikeSpeech("𠀋𠀋𠀋𠀋")).toBe(false);
  });
});

describe("hasSeparator", () => {
  it("有標點才算多值輸入", () => {
    expect(hasSeparator("小明、小華")).toBe(true);
    expect(hasSeparator("海豚 公寓房間")).toBe(false);
  });
});
