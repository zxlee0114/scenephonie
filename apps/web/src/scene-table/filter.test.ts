/**
 * 場次表的搜尋框（票券 15，§7.10）：v1 只做**清單篩選** —— 比對表上除了場次號以外的每一格文字，以及場次號，
 * 純前端 filter over 已在記憶體的投影。全文搜尋不做。
 */
import type { LabeledSceneTableRow } from "@scenephonie/schema";
import { describe, expect, it } from "vitest";

import { filterScenes } from "./filter";

const row = (label: string, fields: Partial<LabeledSceneTableRow> = {}): LabeledSceneTableRow => ({
  sceneId: `sc_${label}`,
  label,
  intExt: "內景",
  time: "日",
  location: "客廳",
  appearingCharacters: "",
  extras: "",
  ...fields,
});

const rows = [
  row("5", { location: "海豚公寓房間（未知大樓房間）", appearingCharacters: "小明（男子）" }),
  row("5.1", { time: "夜", location: "陽台", appearingCharacters: "小明" }),
  row("15", { intExt: "外景", location: "街道", appearingCharacters: "小華", extras: "路人（若干）" }),
  row("50", { location: "屋頂" }),
];
const labels = (query: string) => filterScenes(rows, query, (r) => r).map((r) => r.label);

describe("filterScenes", () => {
  it("空白的搜尋框不篩", () => {
    expect(labels("")).toEqual(["5", "5.1", "15", "50"]);
    expect(labels("   ")).toEqual(["5", "5.1", "15", "50"]);
  });

  it("場次號整個比：`5` 找得到 5 與它的子場次 5.1，找不到 15、50", () => {
    expect(labels("5")).toEqual(["5", "5.1"]);
    expect(labels("5.1")).toEqual(["5.1"]);
    expect(labels("1")).toEqual([]);
  });

  it("場次號前面帶 `S` 也算（sidebar 印的是 `S5`，票券 16）", () => {
    expect(labels("S5")).toEqual(["5", "5.1"]);
    expect(labels("s5.1")).toEqual(["5.1"]);
    expect(labels("S1")).toEqual([]);
  });

  it("地點與人物比整格的字 —— 實體名與這一場的顯示名都找得到", () => {
    expect(labels("海豚")).toEqual(["5"]);
    expect(labels("未知大樓")).toEqual(["5"]);
    expect(labels("小明")).toEqual(["5", "5.1"]);
    expect(labels("男子")).toEqual(["5"]);
  });

  it("時間", () => {
    expect(labels("夜")).toEqual(["5.1"]);
  });

  it("空白分開的幾個詞要全部對上", () => {
    expect(labels("小明 夜")).toEqual(["5.1"]);
    expect(labels("小華　街道")).toEqual(["15"]);
  });

  it("景", () => {
    expect(labels("外景")).toEqual(["15"]);
    expect(labels("內景")).toEqual(["5", "5.1", "50"]);
  });

  it("群演", () => {
    expect(labels("路人")).toEqual(["15"]);
    expect(labels("若干")).toEqual(["15"]);
  });
});
