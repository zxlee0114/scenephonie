/**
 * 群演的值語意（票券 09、45）：「描述 ＋ 人數」的解析、往返、讀取容忍、場次表那一格的文字。
 */
import { describe, expect, it } from "vitest";

import type { CountValue } from "./count";
import {
  extrasLabel,
  formatExtra,
  isExtraId,
  mintExtraId,
  parseExtra,
  sceneExtras,
  statesCount,
} from "./extras";

const some: CountValue = { kind: "some" };

describe("parseExtra —— 括號那一種（顯示與輸入同一個形狀）", () => {
  it("四種樣子都讀得出來", () => {
    expect(parseExtra("路人（8）")?.countValue).toEqual({ kind: "exact", count: 8 });
    expect(parseExtra("路人（3-5）")?.countValue).toEqual({ kind: "range", from: 3, to: 5 });
    expect(parseExtra("路人（10+）")?.countValue).toEqual({ kind: "atLeast", count: 10 });
    expect(parseExtra("路人（若干）")?.countValue).toEqual(some);
  });

  it("半形括號也認，描述留在前面", () => {
    expect(parseExtra("咖啡廳客人(8)")).toEqual({
      description: "咖啡廳客人",
      countValue: { kind: "exact", count: 8 },
    });
  });

  it("括號裡讀不出來時整串是描述 —— 解析是全有全無的（票券 43）", () => {
    expect(parseExtra("路人（三五個）")).toEqual({
      description: "路人（三五個）",
      countValue: some,
    });
  });
});

describe("parseExtra —— 舊的乘號尾綴繼續認（顯示不印，輸入要收）", () => {
  it("空白 ＋ x ＋ 數字是人數，描述留在前面", () => {
    expect(parseExtra("咖啡廳客人 x8")).toEqual({
      description: "咖啡廳客人",
      countValue: { kind: "exact", count: 8 },
    });
  });

  it("沒有空白、大寫 X、全形 ×／＊ 都認得 —— 本子裡已經有這種資料", () => {
    expect(parseExtra("服務生x2")?.countValue).toEqual({ kind: "exact", count: 2 });
    expect(parseExtra("學生 X20")?.countValue).toEqual({ kind: "exact", count: 20 });
    expect(parseExtra("路人 ×3")?.countValue).toEqual({ kind: "exact", count: 3 });
    expect(parseExtra("警察 ＊4")?.countValue).toEqual({ kind: "exact", count: 4 });
  });

  it("全形數字打回半形 —— 注音鍵盤下的數字不該變成另一種寫法", () => {
    expect(parseExtra("學生 x１０")).toEqual({
      description: "學生",
      countValue: { kind: "exact", count: 10 },
    });
  });

  it("描述中間的 x 是名字的一部分，只有結尾的才是人數", () => {
    expect(parseExtra("x 光室的病人")).toEqual({
      description: "x 光室的病人",
      countValue: some,
    });
  });

  it("x0 不算人數 —— 整串字退回去當描述，系統不替編劇判斷那是筆誤還是名字", () => {
    expect(parseExtra("客人 x0")).toEqual({ description: "客人 x0", countValue: some });
    expect(parseExtra("客人（0）")).toEqual({ description: "客人（0）", countValue: some });
  });

  it("乘號後面不只收整數 —— 收窄的是印出來的樣子，不是收得進來的樣子", () => {
    expect(parseExtra("路人 x3-5")?.countValue).toEqual({ kind: "range", from: 3, to: 5 });
    expect(parseExtra("路人 x10+")?.countValue).toEqual({ kind: "atLeast", count: 10 });
  });
});

describe("parseExtra —— 裸的帶符號尾綴（一次打完）", () => {
  it("`路人 10+`、`路人 3-5`、`路人 3~5` 都讀得出來", () => {
    expect(parseExtra("路人 10+")).toEqual({
      description: "路人",
      countValue: { kind: "atLeast", count: 10 },
    });
    expect(parseExtra("路人 3-5")?.countValue).toEqual({ kind: "range", from: 3, to: 5 });
    expect(parseExtra("路人 3~5")?.countValue).toEqual({ kind: "range", from: 3, to: 5 });
    expect(parseExtra("路人 ３～５")?.countValue).toEqual({ kind: "range", from: 3, to: 5 });
  });

  it("裸數字不解析 —— `路人 8` 整串是名字（ADR-0013）", () => {
    expect(parseExtra("路人 8")).toEqual({ description: "路人 8", countValue: some });
    expect(parseExtra("守衛 2")?.description).toBe("守衛 2");
  });
});

describe("parseExtra —— 沒寫人數就是「若干」，描述那一段原樣留著", () => {
  it("打「路人」不會憑空生出一個數字", () => {
    expect(parseExtra("路人")).toEqual({ description: "路人", countValue: some });
  });

  it("名字裡的空白留著（同多值欄輸入規則）", () => {
    expect(parseExtra("  咖啡廳 客人 x8 ")).toEqual({
      description: "咖啡廳 客人",
      countValue: { kind: "exact", count: 8 },
    });
  });

  it("只打了人數（沒有描述）不成立", () => {
    expect(parseExtra("x8")).toBeNull();
    expect(parseExtra("（8）")).toBeNull();
    expect(parseExtra("   ")).toBeNull();
  });
});

describe("往返 —— `parseExtra(formatExtra(e))` 等於 e", () => {
  const roundTrip = (description: string, countValue: CountValue) => {
    const e = { description, countValue };
    expect(parseExtra(formatExtra(e))).toEqual(e);
  };

  it("四種樣子都回得來", () => {
    roundTrip("路人", { kind: "exact", count: 8 });
    roundTrip("路人", { kind: "range", from: 3, to: 5 });
    roundTrip("路人", { kind: "atLeast", count: 10 });
    roundTrip("路人", some);
  });

  it("描述自己帶括號時也成立 —— 只讀結尾那一段", () => {
    roundTrip("路人（8）", some);
    roundTrip("三年二班（甲）", { kind: "exact", count: 30 });
    expect(parseExtra("路人（8）（若干）")).toEqual({
      description: "路人（8）",
      countValue: some,
    });
  });

  it("描述帶全形數字時也成立 —— 描述那一段不做正規化", () => {
    roundTrip("三年二班３", { kind: "exact", count: 30 });
  });
});

describe("sceneExtras —— 讀取容忍（§6.6）", () => {
  const id = mintExtraId();
  const exact = (count: number): CountValue => ({ kind: "exact", count });

  it("正常的清單原樣讀出來", () => {
    expect(sceneExtras([{ extraId: id, description: "咖啡廳客人", countValue: exact(8) }])).toEqual([
      { extraId: id, description: "咖啡廳客人", countValue: exact(8) },
    ]);
  });

  it("人數壞掉補「若干」，不丟掉那一筆 —— 補 1 是系統自己宣告一個數字（票券 45）", () => {
    const of = (countValue: unknown) =>
      sceneExtras([{ extraId: id, description: "客人", countValue }])[0];
    expect(of("八")).toEqual({ extraId: id, description: "客人", countValue: some });
    expect(sceneExtras([{ extraId: id, description: "客人" }])[0]?.countValue).toEqual(some);
    expect(of({ kind: "range", from: 5, to: 3 })?.countValue).toEqual(some);
    expect(of({ kind: "exact", count: 0 })?.countValue).toEqual(some);
    expect(of(null)?.countValue).toEqual(some);
  });

  it("裸數字讀成「確切 N」—— 這是容錯（複製貼上、匯入、fixture），不是遷移", () => {
    const of = (countValue: unknown) =>
      sceneExtras([{ extraId: id, description: "客人", countValue }])[0]?.countValue;
    expect(of(8)).toEqual(exact(8));
    // 0 與非整數沒有誠實的讀法 —— 那條路走「補若干」，不是「補 1」。
    expect(of(0)).toEqual(some);
    expect(of(2.5)).toEqual(some);
  });

  it("兩端相同的區間在讀取路徑上也收斂成確切 —— `路人（3-3）` 不從這裡溜回畫面", () => {
    const countValue = { kind: "range", from: 3, to: 3 };
    expect(sceneExtras([{ extraId: id, description: "客人", countValue }])[0]?.countValue).toEqual(
      exact(3),
    );
  });

  it("⚠️ 舊的 `count` 欄位已經不存在了（票券 50 的 contract）—— 帶著它的資料照樣讀得出來，但那個數字不算數", () => {
    // 遷移窗口裡它會說謊（`路人（3-5）` 的舊欄位是 3、`路人（若干）` 的是 1），所以票券 50
    // 把它刪掉之後**沒有人再讀它**。人數只看 `countValue` 那一格。
    expect(sceneExtras([{ extraId: id, description: "客人", count: 8 }])[0]?.countValue).toEqual(
      some,
    );
    expect(
      sceneExtras([{ extraId: id, description: "客人", count: 7, countValue: exact(8) }]),
    ).toEqual([{ extraId: id, description: "客人", countValue: exact(8) }]);
  });

  it("沒有 extraId／描述不是字串的丟掉；不是陣列就是空的", () => {
    expect(sceneExtras([{ description: "客人", countValue: exact(2) }])).toEqual([]);
    expect(sceneExtras([{ extraId: id, countValue: exact(2) }])).toEqual([]);
    expect(sceneExtras(null)).toEqual([]);
    expect(sceneExtras("咖啡廳客人 x8")).toEqual([]);
  });
});

describe("場次表第一層那一格", () => {
  it("印的是括號不是乘號，四種樣子都成立", () => {
    const of = (countValue: CountValue) =>
      formatExtra({ description: "路人", countValue });
    expect(of({ kind: "exact", count: 8 })).toBe("路人（8）");
    expect(of({ kind: "range", from: 3, to: 5 })).toBe("路人（3-5）");
    expect(of({ kind: "atLeast", count: 10 })).toBe("路人（10+）");
    expect(of(some)).toBe("路人（若干）");
  });

  it("人數一律印出來，多組以頓號相連", () => {
    expect(
      extrasLabel([
        { extraId: mintExtraId(), description: "咖啡廳客人", countValue: { kind: "exact", count: 8 } },
        { extraId: mintExtraId(), description: "服務生", countValue: some },
      ]),
    ).toBe("咖啡廳客人（8）、服務生（若干）");
  });
});

describe("extraId", () => {
  it("前綴是 ex_，形狀可辨（下游一眼分得出場次限定實體）", () => {
    const id = mintExtraId();
    expect(id.startsWith("ex_")).toBe(true);
    expect(isExtraId(id)).toBe(true);
    expect(isExtraId("ch_1")).toBe(false);
    expect(isExtraId("ex_")).toBe(false);
  });
});

describe("statesCount —— 這串字裡編劇說了人數沒有（票券 49）", () => {
  it("三種尾綴都算說了", () => {
    expect(statesCount("路人（8）")).toBe(true);
    expect(statesCount("路人 x8")).toBe(true);
    expect(statesCount("路人 10+")).toBe(true);
    expect(statesCount("路人（3-5）")).toBe(true);
  });

  it("括號裡的「若干」也算說了 —— 括號本身就是他的宣告", () => {
    expect(statesCount("路人（若干）")).toBe(true);
  });

  it("光禿禿一個描述沒說", () => {
    expect(statesCount("路人")).toBe(false);
    expect(statesCount("")).toBe(false);
  });

  it("裸數字沒說 —— 那是名字的一部分（ADR-0013、票券 43）", () => {
    expect(statesCount("路人 8")).toBe(false);
  });

  it("讀不出來的尾綴沒說 —— 整串退回去當描述，那就是他沒說", () => {
    expect(statesCount("路人（三五個）")).toBe(false);
  });

  it("沒有描述的那一串不算 —— `parseExtra` 根本讀不出一筆群演", () => {
    expect(statesCount("x8")).toBe(false);
  });
});
