/**
 * 「這筆實體被幾場引用」的 projection（票券 08）。它同時是「存在＝被引用」在畫面上的形狀：
 * 數到 0 的實體是孤兒，孤兒不出現在自動補全。
 */
import { describe, expect, it } from "vitest";

import { docFromJSON, mintSceneId } from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

import { aliasIndex, aliasesOf, entityUsage, scenesShowingName } from "./entity-usage";

const scene = (attrs: Record<string, unknown>, blocks: Record<string, unknown>[] = []) => ({
  type: "scene",
  attrs: { sceneId: mintSceneId(), ...attrs },
  content: blocks.length > 0 ? blocks : [{ type: "action" }],
});

const dialogue = (id: string | null, displayName: string) => ({
  type: "dialogue",
  attrs: { character: id ? { id, displayName } : null, voiceStyle: "一般" },
});

const docOf = (...scenes: Record<string, unknown>[]): PMNode =>
  docFromJSON({ type: "doc", content: scenes }) as unknown as PMNode;

describe("entityUsage", () => {
  it("同一筆地點出現在兩場 → 2", () => {
    const riverbank = { locationId: "lo_1", displayName: "河堤" };
    const usage = entityUsage(docOf(scene({ location: riverbank }), scene({ location: riverbank })));

    expect(usage.get("lo_1")).toBe(2);
  });

  it("計數單位是場次，不是引用次數 —— 同一場裡的地點欄與對白人物欄各數各的實體", () => {
    const usage = entityUsage(
      docOf(
        scene({ location: { locationId: "lo_1", displayName: "河堤" } }, [
          dialogue("ch_1", "阿盈"),
          dialogue("ch_1", "阿盈"),
        ]),
      ),
    );

    expect(usage.get("lo_1")).toBe(1);
    expect(usage.get("ch_1")).toBe(1); // 同一場兩句台詞仍然是一場
  });

  it("登場人物欄也算引用（判準是入鏡，那一欄由編劇填）", () => {
    const usage = entityUsage(
      docOf(scene({ appearingCharacters: [{ characterId: "ch_2", displayName: "建鳴" }] })),
    );

    expect(usage.get("ch_2")).toBe(1);
  });

  it("沒有被引用的實體不會出現在結果裡 —— 孤兒就是數不到的那些", () => {
    const usage = entityUsage(docOf(scene({})));

    expect(usage.size).toBe(0);
  });

  it("id 為 null 的過渡引用不算 —— 它指不到任何實體", () => {
    const usage = entityUsage(docOf(scene({ location: { locationId: null, displayName: "河堤" } })));

    expect(usage.size).toBe(0);
  });
});

describe("scenesShowingName", () => {
  const room = (displayName: string) => ({ locationId: "lo_1", displayName });

  it("數的是「還印著這個名字」的場次 —— 取過別名的那一場不算", () => {
    const doc = docOf(
      scene({ location: room("海豚公寓房間") }),
      scene({ location: room("海豚公寓房間") }),
      scene({ location: room("未知大樓房間") }),
    );

    expect(scenesShowingName(doc, "lo_1", "海豚公寓房間")).toBe(2);
  });

  it("同一場的兩個位置印著同一個名字仍然是一場（單位與 entityUsage 一致）", () => {
    const doc = docOf(
      scene({ appearingCharacters: [{ characterId: "ch_1", displayName: "阿盈" }] }, [
        dialogue("ch_1", "阿盈"),
      ]),
    );

    expect(scenesShowingName(doc, "ch_1", "阿盈")).toBe(1);
  });

  it("別筆實體剛好同名不算 —— 判準是 id ＋ 顯示名", () => {
    const doc = docOf(scene({}, [dialogue("ch_2", "阿盈")]));

    expect(scenesShowingName(doc, "ch_1", "阿盈")).toBe(0);
  });
});

describe("aliasesOf", () => {
  it("劇本裡叫過他、但不是實體名的那些名字，依第一次出現的順序，不重複", () => {
    const doc = docOf(
      scene({ appearingCharacters: [{ characterId: "ch_1", displayName: "小陳" }] }, [dialogue("ch_1", "小智")]),
      scene({}, [dialogue("ch_1", "小陳"), dialogue("ch_1", "阿智")]),
    );

    expect(aliasesOf(doc, "ch_1", "小智")).toEqual(["小陳", "阿智"]);
  });

  it("別筆實體的顯示名不算", () => {
    const doc = docOf(scene({}, [dialogue("ch_2", "阿盈")]));

    expect(aliasesOf(doc, "ch_1", "小智")).toEqual([]);
  });
});

describe("aliasIndex", () => {
  it("一趟走訪交出每筆實體的別名 —— 實體名不算，沒有別名的實體不在裡面", () => {
    const doc = docOf(
      scene({ location: { locationId: "lo_1", displayName: "未知大樓房間" } }, [dialogue("ch_1", "我是誰")]),
      scene({ location: { locationId: "lo_1", displayName: "海豚公寓房間" } }, [
        dialogue("ch_1", "我是龍"),
        dialogue("ch_2", "小智"),
      ]),
    );
    const entities = [
      { id: "lo_1", name: "海豚公寓房間" },
      { id: "ch_1", name: "我是龍" },
      { id: "ch_2", name: "小智" },
    ];

    expect(aliasIndex(doc, entities)).toEqual(
      new Map([
        ["lo_1", ["未知大樓房間"]],
        ["ch_1", ["我是誰"]],
      ]),
    );
  });

  it("目錄裡沒有的 id（懸空引用）不進結果 —— 不知道它的實體名，就分不出哪個是別名", () => {
    const doc = docOf(scene({}, [dialogue("ch_9", "路人")]));

    expect(aliasIndex(doc, []).size).toBe(0);
  });
});
