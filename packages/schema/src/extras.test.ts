/**
 * 群演的值語意（票券 09）：`描述 x 人數` 的解析、讀取容忍、場次表那一格的文字。
 */
import { describe, expect, it } from "vitest";

import { extrasLabel, formatExtra, isExtraId, mintExtraId, parseExtra, sceneExtras } from "./extras";

describe("parseExtra —— 「描述 x 人數」", () => {
  it("空白 ＋ x ＋ 數字是人數，描述留在前面", () => {
    expect(parseExtra("咖啡廳客人 x8")).toEqual({ description: "咖啡廳客人", count: 8 });
  });

  it("沒有空白、大寫 X、全形 ×／＊ 都認得", () => {
    expect(parseExtra("服務生x2")).toEqual({ description: "服務生", count: 2 });
    expect(parseExtra("學生 X20")).toEqual({ description: "學生", count: 20 });
    expect(parseExtra("路人 ×3")).toEqual({ description: "路人", count: 3 });
    expect(parseExtra("警察 ＊4")).toEqual({ description: "警察", count: 4 });
  });

  it("全形數字打回半形 —— 注音鍵盤下的數字不該變成另一種寫法", () => {
    expect(parseExtra("學生 x１０")).toEqual({ description: "學生", count: 10 });
  });

  it("沒寫人數就是 1 —— 不留「未填」這個狀態", () => {
    expect(parseExtra("服務生")).toEqual({ description: "服務生", count: 1 });
  });

  it("描述中間的 x 是名字的一部分，只有結尾的才是人數", () => {
    expect(parseExtra("x 光室的病人")).toEqual({ description: "x 光室的病人", count: 1 });
  });

  it("名字裡的空白留著（同多值欄輸入規則）", () => {
    expect(parseExtra("  咖啡廳 客人 x8 ")).toEqual({ description: "咖啡廳 客人", count: 8 });
  });

  it("x0 不算人數 —— 整串字退回去當描述，系統不替編劇判斷那是筆誤還是名字", () => {
    expect(parseExtra("客人 x0")).toEqual({ description: "客人 x0", count: 1 });
  });

  it("只打了人數（沒有描述）不成立", () => {
    expect(parseExtra("x8")).toBeNull();
    expect(parseExtra("   ")).toBeNull();
  });
});

describe("sceneExtras —— 讀取容忍（§6.6）", () => {
  const id = mintExtraId();

  it("正常的清單原樣讀出來", () => {
    expect(sceneExtras([{ extraId: id, description: "咖啡廳客人", count: 8 }])).toEqual([
      { extraId: id, description: "咖啡廳客人", count: 8, countValue: { kind: "exact", count: 8 } },
    ]);
  });

  it("人數壞掉補成 1，不丟掉那一筆 —— 描述才是內容", () => {
    expect(sceneExtras([{ extraId: id, description: "客人", count: "八" }])).toEqual([
      { extraId: id, description: "客人", count: 1, countValue: { kind: "exact", count: 1 } },
    ]);
  });

  it("沒有 extraId／描述不是字串的丟掉；不是陣列就是空的", () => {
    expect(sceneExtras([{ description: "客人", count: 2 }])).toEqual([]);
    expect(sceneExtras([{ extraId: id, count: 2 }])).toEqual([]);
    expect(sceneExtras(null)).toEqual([]);
    expect(sceneExtras("咖啡廳客人 x8")).toEqual([]);
  });
});

describe("sceneExtras —— 新舊兩個形態並存（票券 44 的遷移窗口）", () => {
  const id = mintExtraId();

  it("舊資料只有數字時，新形態由它推出「確切 N」", () => {
    expect(sceneExtras([{ extraId: id, description: "客人", count: 8 }])[0]?.countValue).toEqual({
      kind: "exact",
      count: 8,
    });
  });

  it("新形態存在時，舊欄位填下限 —— 區間與下限用下限", () => {
    const of = (countValue: unknown) =>
      sceneExtras([{ extraId: id, description: "客人", countValue }])[0];
    expect(of({ kind: "range", from: 3, to: 5 })).toEqual({
      extraId: id,
      description: "客人",
      count: 3,
      countValue: { kind: "range", from: 3, to: 5 },
    });
    expect(of({ kind: "atLeast", count: 10 })?.count).toBe(10);
  });

  it("⚠️ 若干的舊欄位只能填 1 —— 那個數字在遷移窗口裡會說謊，票券 50 把它刪掉", () => {
    expect(sceneExtras([{ extraId: id, description: "客人", countValue: { kind: "some" } }])).toEqual([
      { extraId: id, description: "客人", count: 1, countValue: { kind: "some" } },
    ]);
  });

  it("兩端相同的區間在讀取路徑上也收斂成確切 —— `路人（3-3）` 不從這裡溜回畫面", () => {
    const countValue = { kind: "range", from: 3, to: 3 };
    const [read] = sceneExtras([{ extraId: id, description: "客人", countValue }]);
    expect(read?.countValue).toEqual({ kind: "exact", count: 3 });
  });

  it("若干不參加打架 —— 它沒有數字，舊欄位是幾都不構成矛盾", () => {
    expect(
      sceneExtras([{ extraId: id, description: "客人", count: 1, countValue: { kind: "some" } }])[0]
        ?.countValue,
    ).toEqual({ kind: "some" });
    expect(
      sceneExtras([{ extraId: id, description: "客人", count: 7, countValue: { kind: "some" } }])[0]
        ?.countValue,
    ).toEqual({ kind: "some" });
  });

  it("兩邊打架時舊的數字贏 —— 這個窗口裡只有舊寫入端在動（升格拉走一個人：8 → 7）", () => {
    expect(
      sceneExtras([
        { extraId: id, description: "客人", count: 7, countValue: { kind: "exact", count: 8 } },
      ]),
    ).toEqual([
      { extraId: id, description: "客人", count: 7, countValue: { kind: "exact", count: 7 } },
    ]);
  });

  it("壞掉的新形態退回去看舊欄位 —— 少讀一個形狀，不讓整筆掉", () => {
    const of = (countValue: unknown) =>
      sceneExtras([{ extraId: id, description: "客人", count: 6, countValue }])[0]?.countValue;
    expect(of({ kind: "range", from: 5, to: 3 })).toEqual({ kind: "exact", count: 6 });
    expect(of({ kind: "exact", count: 0 })).toEqual({ kind: "exact", count: 6 });
    expect(of("若干")).toEqual({ kind: "exact", count: 6 });
    expect(of(null)).toEqual({ kind: "exact", count: 6 });
  });
});

describe("場次表第一層那一格", () => {
  it("人數一律印出來，多組以頓號相連", () => {
    expect(formatExtra({ description: "服務生", count: 1 })).toBe("服務生 x1");
    expect(
      extrasLabel([
        { extraId: mintExtraId(), description: "咖啡廳客人", count: 8 },
        { extraId: mintExtraId(), description: "服務生", count: 2 },
      ]),
    ).toBe("咖啡廳客人 x8、服務生 x2");
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
