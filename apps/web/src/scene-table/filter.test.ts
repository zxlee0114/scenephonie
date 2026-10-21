/**
 * 場次表的搜尋框（票券 15，§7.10）：v1 只做**清單篩選** —— 比對場次號／地點／人物／時間，
 * 純前端 filter over 已在記憶體的投影。全文搜尋不做。
 */
import type { LabeledSceneTableRow } from "@scenephonie/schema";
import { describe, expect, it } from "vitest";

import { filterSceneTable } from "./filter";

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
  row("15", { location: "街道", appearingCharacters: "小華", extras: "路人（若干）" }),
  row("50", { location: "屋頂" }),
];
const labels = (query: string) => filterSceneTable(rows, query).map((r) => r.label);

describe("filterSceneTable", () => {
  it("空白的搜尋框不篩", () => {
    expect(labels("")).toEqual(["5", "5.1", "15", "50"]);
    expect(labels("   ")).toEqual(["5", "5.1", "15", "50"]);
  });

  it("場次號整個比：`5` 找得到 5 與它的子場次 5.1，找不到 15、50", () => {
    expect(labels("5")).toEqual(["5", "5.1"]);
    expect(labels("5.1")).toEqual(["5.1"]);
    expect(labels("1")).toEqual([]);
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

  it("群演與景不在比對範圍裡", () => {
    expect(labels("路人")).toEqual([]);
    expect(labels("內景")).toEqual([]);
  });
});
