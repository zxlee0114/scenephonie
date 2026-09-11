/**
 * 人數的四種樣子與人數輸入的兩層（票券 44）。
 *
 * 前兩個 describe 刻意互不沾邊：**解析那一層的測試裡沒有一個中文字**（它只認符號與數字），
 * **文案那一層的測試裡沒有一條解析規則**（它只把狀態翻成話）。這條分界就是這張票切兩層的
 * 理由 —— 混在一起時，每一種輸入都得用 jsdom 打字、讀 DOM 才測得到。
 *
 * 最後一個 describe 是票券 46 的「升格減一」—— 它是四種樣子上的**算術**，與上面兩層同樣是
 * 純函式，所以住在同一個檔案。
 */
import { describe, expect, it } from "vitest";

import {
  countAfterTakingOne,
  countHintText,
  countLowerBound,
  resolveCountInput,
  type CountValue,
} from "./count";

describe("resolveCountInput —— 只認符號與數字", () => {
  it("空的（含只有空白）是 empty —— 那不是讀不出來，是還沒說", () => {
    expect(resolveCountInput("")).toEqual({ state: "empty" });
    expect(resolveCountInput("  \u3000")).toEqual({ state: "empty" });
  });

  it("裸數字是確切人數", () => {
    expect(resolveCountInput("8")).toEqual({ state: "parsed", value: { kind: "exact", count: 8 } });
  });

  it("`-` 與 `~` 都是區間", () => {
    expect(resolveCountInput("3-5")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
    expect(resolveCountInput("3~5")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
  });

  it("`+` 是下限", () => {
    expect(resolveCountInput("10+")).toEqual({
      state: "parsed",
      value: { kind: "atLeast", count: 10 },
    });
  });

  it("全形數字與全形 ＋～－—〜 一樣認 —— 注音鍵盤打出來的就是這些", () => {
    expect(resolveCountInput("８")).toEqual({ state: "parsed", value: { kind: "exact", count: 8 } });
    expect(resolveCountInput("１０＋")).toEqual({
      state: "parsed",
      value: { kind: "atLeast", count: 10 },
    });
    expect(resolveCountInput("3～5")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
    expect(resolveCountInput("3〜5")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
    expect(resolveCountInput("3－5")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
    expect(resolveCountInput("3—5")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
  });

  it("符號前後的空白不影響 —— 這一格裡的空白不帶意思", () => {
    expect(resolveCountInput(" 3 - 5 ")).toEqual({
      state: "parsed",
      value: { kind: "range", from: 3, to: 5 },
    });
  });

  it("兩端相同的區間收斂成確切 —— `3-3` 印成區間會像壞掉", () => {
    expect(resolveCountInput("3-3")).toEqual({ state: "parsed", value: { kind: "exact", count: 3 } });
  });

  it("倒過來的區間讀不出來 —— 不替編劇把兩端對調", () => {
    expect(resolveCountInput("5-3")).toEqual({ state: "unreadable", raw: "5-3" });
  });

  it("0 讀不出來 —— 0 個背景演員等於沒有這一筆（同票券 09 對 x0 的裁決）", () => {
    expect(resolveCountInput("0")).toEqual({ state: "unreadable", raw: "0" });
    expect(resolveCountInput("0+")).toEqual({ state: "unreadable", raw: "0+" });
  });

  it("數字中間的空白不吃 —— `1 0` 沒有誠實的讀法，接成 10 會給出他沒打過的數字", () => {
    expect(resolveCountInput("1 0")).toEqual({ state: "unreadable", raw: "1 0" });
    expect(resolveCountInput("3 5")).toEqual({ state: "unreadable", raw: "3 5" });
  });

  it("打到一半讀不出來，原字照樣還在 raw 裡", () => {
    expect(resolveCountInput("3~")).toEqual({ state: "unreadable", raw: "3~" });
    expect(resolveCountInput("abc")).toEqual({ state: "unreadable", raw: "abc" });
  });

  it("這一格只裝人數 —— 帶著名稱的一串字讀不出來（票券 43 的 ADR）", () => {
    expect(resolveCountInput("路人 8")).toEqual({ state: "unreadable", raw: "路人 8" });
  });
});

describe("countLowerBound —— 排序用得到的那個數字", () => {
  it("確切回自己、區間與下限回下限", () => {
    expect(countLowerBound({ kind: "exact", count: 8 })).toBe(8);
    expect(countLowerBound({ kind: "range", from: 3, to: 5 })).toBe(3);
    expect(countLowerBound({ kind: "atLeast", count: 10 })).toBe(10);
  });

  it("若干沒有下限 —— 回 null，不回 1", () => {
    expect(countLowerBound({ kind: "some" })).toBeNull();
  });
});

describe("countHintText —— 只把狀態翻成話", () => {
  const some: CountValue = { kind: "some" };

  it("空著時是格式說明 —— 它說的是「這裡打得出什麼」", () => {
    expect(countHintText({ state: "empty" }, some, "路人")).toBe(
      "人數（8）、區間（3~5、3-5、10+）",
    );
  });

  it("讀得出來時是預覽，四種樣子都印得出括號", () => {
    const preview = (value: CountValue) =>
      countHintText({ state: "parsed", value }, some, "路人");
    expect(preview({ kind: "exact", count: 8 })).toBe("路人（8）");
    expect(preview({ kind: "range", from: 3, to: 5 })).toBe("路人（3-5）");
    expect(preview({ kind: "atLeast", count: 10 })).toBe("路人（10+）");
    expect(preview(some)).toBe("路人（若干）");
  });

  it("讀不出來時是警告，而且說得出現在離開會記成什麼", () => {
    expect(countHintText({ state: "unreadable", raw: "3~" }, some, "路人")).toBe(
      "⚠️ 「3~」還讀不出來 —— 現在離開會記成「路人（若干）」",
    );
  });

  it("fallback 是「現在離開會記成什麼」—— 修改時那是原值，不是若干", () => {
    expect(
      countHintText({ state: "unreadable", raw: "3~" }, { kind: "exact", count: 8 }, "路人"),
    ).toBe("⚠️ 「3~」還讀不出來 —— 現在離開會記成「路人（8）」");
  });
});

describe("countAfterTakingOne —— 升格拉走一個之後那批人剩多少（票券 46）", () => {
  it("確切減一", () => {
    expect(countAfterTakingOne({ kind: "exact", count: 8 })).toEqual({ kind: "exact", count: 7 });
  });

  it("只有確切走得到「減到 0 就整筆移除」", () => {
    expect(countAfterTakingOne({ kind: "exact", count: 1 })).toBeNull();
  });

  it("區間兩端一起減 —— 它本來就沒有說死有幾個人，不會消失", () => {
    expect(countAfterTakingOne({ kind: "range", from: 3, to: 5 })).toEqual({
      kind: "range",
      from: 2,
      to: 4,
    });
  });

  it("下限減一", () => {
    expect(countAfterTakingOne({ kind: "atLeast", count: 10 })).toEqual({
      kind: "atLeast",
      count: 9,
    });
  });

  it("若干還是若干 —— 沒有數字可減，那批人也還在", () => {
    expect(countAfterTakingOne({ kind: "some" })).toEqual({ kind: "some" });
  });

  it("減不到 1 以下 —— 0 不是四種樣子裡的任何一種", () => {
    expect(countAfterTakingOne({ kind: "atLeast", count: 1 })).toEqual({
      kind: "atLeast",
      count: 1,
    });
    expect(countAfterTakingOne({ kind: "range", from: 1, to: 3 })).toEqual({
      kind: "range",
      from: 1,
      to: 2,
    });
  });

  it("區間縮到兩端相同就是確切 —— 同 countValueOf 那條收斂", () => {
    // `1-2` 的下限踩在 1 上減不動、上限減成 1，兩端相同 → 確切 1。
    expect(countAfterTakingOne({ kind: "range", from: 1, to: 2 })).toEqual({
      kind: "exact",
      count: 1,
    });
  });
});
