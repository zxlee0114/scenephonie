/**
 * 場次導覽 sidebar 的列（票券 16，§7.10）：sidebar ＝ 創作中的定位 —— 每一場一列（**含草稿並標示**），
 * 形如 `S1 內 日 廚房`（欄序比照 §8）。子場次縮排一級、群組成員看得出同組、群組本身不列。
 */
import {
  mintCharacterId,
  mintGroupId,
  mintLocationId,
  mintSceneId,
  projectScenes,
  schema as k,
} from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { filterScenes } from "@/scene-table/filter";

import { sceneNavRows } from "./rows";

const kitchen = { id: mintLocationId(), name: "海豚公寓廚房" };
const ming = { id: mintCharacterId(), name: "小明" };
const names = {
  characters: new Map([[ming.id, ming.name]]),
  locations: new Map([[kitchen.id, kitchen.name]]),
};

const action = (text: string) => k.node("action", null, text ? [k.text(text)] : []);
const at = (displayName: string, locationId = mintLocationId()) => ({ locationId, displayName });
const filled = (attrs: Record<string, unknown> = {}) => ({
  time: "日",
  intExt: "內景",
  location: at("廚房", kitchen.id),
  ...attrs,
});
const scene = (text: string, attrs: Record<string, unknown> = filled(), extra: PMNode[] = []) =>
  k.node("scene", { sceneId: mintSceneId(), ...attrs }, [action(text), ...extra]);
const sub = (text: string, attrs: Record<string, unknown> = {}) =>
  k.node("subscene", { sceneId: mintSceneId(), kind: "插入", ...filled({ time: "夜", ...attrs }) }, [action(text)]);

const rowsOf = (doc: PMNode) => sceneNavRows(projectScenes(doc), doc, names);
/** 一列畫出來的那一行字。 */
const line = (r: ReturnType<typeof rowsOf>[number]) =>
  [r.label, r.intExt, r.time, r.location].filter(Boolean).join(" ");

describe("sceneNavRows", () => {
  it("每一場一列，形如 `S1 內 日 廚房`：S 前綴、景取簡稱、地點印這一場的顯示名", () => {
    const doc = k.node("doc", null, [
      scene("煮麵"),
      scene("下樓", filled({ intExt: "外景", time: "夜", location: at("巷口") })),
      scene("跨進門", filled({ intExt: "內外景", time: "晨", location: at("門口") })),
      scene("蒙太奇", filled({ intExt: "雜景", time: "昏", location: [at("街道"), at("車站")] })),
    ]);
    expect(rowsOf(doc).map(line)).toEqual([
      "S1 內 日 廚房",
      "S2 外 夜 巷口",
      "S3 內外 晨 門口",
      "S4 雜 昏 街道、車站",
    ]);
  });

  it("草稿也列（場次表不列的那些），場次號欄印「草稿」；空欄就不印", () => {
    const doc = k.node("doc", null, [
      scene("煮麵"),
      scene("還沒想好", filled({ time: null, location: null })),
      scene("", filled({ time: "夜" })),
      scene("吃麵", filled({ intExt: "外景" })),
    ]);
    const rows = rowsOf(doc);
    // 草稿不佔號，場次號欄印「草稿」；點名用的標籤在 `title`（同 gutter，票券 16 使用者裁決）。
    expect(rows.map(line)).toEqual(["S1 內 日 廚房", "草稿 內", "草稿 內 夜 廚房", "S2 外 日 廚房"]);
    expect(rows.map((r) => r.title)).toEqual([undefined, "S1[D1]", "S1[D2]", undefined]);
    expect(rows.map((r) => r.draft)).toEqual([false, true, true, false]);
  });

  it("子場次縮排一級；群組成員（連同它們的子場次）帶群組 id、群組本身不列", () => {
    const groupId = mintGroupId();
    const a = k.node("groupMember", { sceneId: mintSceneId(), ...filled({ location: at("甲家") }) });
    const b = k.node("groupMember", { sceneId: mintSceneId(), ...filled({ location: at("乙家") }) });
    const fragment = (m: PMNode, content: PMNode[]) =>
      k.node("groupFragment", { memberId: m.attrs.sceneId as string }, content);
    const doc = k.node("doc", null, [
      scene("煮麵", filled(), [sub("回憶")]),
      k.node("sceneGroup", { groupId }, [
        a,
        b,
        fragment(a, [action("甲打電話"), sub("甲的回憶", { location: at("學校") })]),
        fragment(b, [action("乙接電話")]),
      ]),
      scene("吃麵"),
    ]);
    const rows = rowsOf(doc);
    expect(rows.map((r) => [line(r), r.sub, r.groupId])).toEqual([
      ["S1 內 日 廚房", false, undefined],
      ["S1.1 內 夜 廚房", true, undefined],
      ["S2 內 日 甲家", false, groupId],
      ["S2.1 內 夜 學校", true, groupId],
      ["S3 內 日 乙家", false, groupId],
      ["S4 內 日 廚房", false, undefined],
    ]);
  });

  it("篩選比的是表上那幾欄：景的全稱、實體名與這一場的顯示名、人物、群演（草稿也篩得到）", () => {
    const doc = k.node("doc", null, [
      scene("煮麵", filled({ appearingCharacters: [{ characterId: ming.id, displayName: "男子" }] })),
      scene("吃麵", filled({ intExt: "內外景", time: null })),
    ]);
    const shown = (query: string) =>
      filterScenes(rowsOf(doc), query, (r) => r.search).map((r) => r.title ?? r.label);
    expect(shown("海豚公寓")).toEqual(["S1", "S1[D1]"]);
    expect(shown("小明")).toEqual(["S1"]);
    expect(shown("男子")).toEqual(["S1"]);
    expect(shown("內外景")).toEqual(["S1[D1]"]);
    expect(shown("S1")).toEqual(["S1"]);
  });
});
