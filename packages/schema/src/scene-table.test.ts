/**
 * 場次表（票券 15，§8）—— 第一層投影，純從劇本推導、零新增資訊。
 *
 * 兩段：`projectSceneTable(doc)` 決定**哪些列、什麼順序、每一列的原始值**（只吃 doc）；
 * `labelSceneTable(table, names)` 把實體名接上去、印成格子裡的字（實體名不在 doc 裡）。
 */
import { describe, expect, it } from "vitest";

import { mintCharacterId, mintLocationId } from "./entities";
import { labelSceneTable, projectSceneTable } from "./scene-table";
import {
  block,
  filled,
  fragmentOf,
  groupWith,
  makeDoc,
  memberWith,
  sceneWith,
  subsceneWith,
} from "./testing";

const scene = (attrs: Record<string, unknown> = filled(), blocks = [block.action("走進房間")]) =>
  sceneWith(blocks, attrs);
const labels = (doc: ReturnType<typeof makeDoc>) => projectSceneTable(doc).rows.map((r) => r.label);

describe("projectSceneTable：哪些列進表", () => {
  it("一場正式場次是一列，帶著它的六欄原始值", () => {
    const location = { locationId: mintLocationId(), displayName: "未知大樓房間" };
    const character = { characterId: mintCharacterId(), displayName: "男子" };
    const s = scene({
      time: "夜",
      intExt: "內景",
      location,
      appearingCharacters: [character],
      extras: [{ extraId: "ex_1", description: "路人", countValue: { kind: "exact", count: 3 } }],
    });

    expect(projectSceneTable(makeDoc(s)).rows).toEqual([
      {
        sceneId: s.attrs.sceneId,
        label: "1",
        intExt: "內景",
        time: "夜",
        locations: [location],
        appearingCharacters: [character],
        extras: [{ extraId: "ex_1", description: "路人", countValue: { kind: "exact", count: 3 } }],
      },
    ]);
  });

  it("草稿不進表；後面的正式場次照樣是它的正式號", () => {
    const doc = makeDoc(scene(), scene(filled({ time: null })), scene(filled({ manualDraft: true })), scene());
    expect(labels(doc)).toEqual(["1", "2"]);
  });

  it("主場次是草稿，子場次連帶不進表", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續", ...filled({ time: "夜" }) });
    const parent = sceneWith([block.action("走進房間"), sub], filled({ manualDraft: true }));
    expect(labels(makeDoc(scene(), parent))).toEqual(["1"]);
  });

  it("子場次自佔一列，緊接主場次之後；只標出它的主場次（縮排用），不帶種類", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "插入", ...filled({ time: "夜" }) });
    const parent = sceneWith([block.action("走進房間"), sub, block.action("回來")], filled());
    const { rows } = projectSceneTable(makeDoc(parent, scene()));

    expect(rows.map((r) => r.label)).toEqual(["1", "1.1", "2"]);
    expect(rows[1]).toMatchObject({ sceneId: sub.attrs.sceneId, parentSceneId: parent.attrs.sceneId });
    expect(rows[1]).not.toHaveProperty("kind");
    expect(rows[0]).not.toHaveProperty("parentSceneId");
  });

  it("群組成員各自一列，群組本身不進表", () => {
    const a = memberWith(filled());
    const b = memberWith(filled({ time: "夜" }));
    const group = groupWith([a, b], [fragmentOf(a, [block.action("甲")]), fragmentOf(b, [block.action("乙")])]);
    const { rows } = projectSceneTable(makeDoc(scene(), group, scene()));

    expect(rows.map((r) => [r.label, r.sceneId])).toEqual([
      ["1", rows[0]!.sceneId],
      ["2", a.attrs.sceneId],
      ["3", b.attrs.sceneId],
      ["4", rows[3]!.sceneId],
    ]);
  });
});

describe("labelSceneTable：格子裡印什麼", () => {
  const dolphin = { locationId: mintLocationId(), displayName: "未知大樓房間" };
  const ming = { characterId: mintCharacterId(), displayName: "男子" };
  const hua = { characterId: mintCharacterId(), displayName: "小華" };
  const names = {
    locations: new Map([[dolphin.locationId, "海豚公寓房間"]]),
    characters: new Map([
      [ming.characterId, "小明"],
      [hua.characterId, "小華"],
    ]),
  };
  const labelled = (attrs: Record<string, unknown>) =>
    labelSceneTable(projectSceneTable(makeDoc(scene(filled(attrs)))), names).rows[0]!;

  it("實體名與這一場的顯示名不同才印括號：`實體名（顯示名）`；相同就只印一次", () => {
    const row = labelled({ location: dolphin, appearingCharacters: [ming, hua] });
    expect(row.location).toBe("海豚公寓房間（未知大樓房間）");
    expect(row.appearingCharacters).toBe("小明（男子）、小華");
  });

  it("雜景不拆：印編劇填的地點清單；留空時印推導文字「參照敘述」", () => {
    const street = { locationId: mintLocationId(), displayName: "街道" };
    expect(labelled({ intExt: "雜景", location: [dolphin, street] }).location).toBe(
      "海豚公寓房間（未知大樓房間）、街道",
    );
    expect(labelled({ intExt: "雜景", location: null }).location).toBe("參照敘述");
  });

  it("群演格：描述（人數），多組以頓號相連；沒有群演是空格", () => {
    const extras = [
      { extraId: "ex_1", description: "咖啡廳客人", countValue: { kind: "exact", count: 8 } },
      { extraId: "ex_2", description: "服務生", countValue: { kind: "some" } },
    ];
    expect(labelled({ extras }).extras).toBe("咖啡廳客人（8）、服務生（若干）");
    expect(labelled({}).extras).toBe("");
  });

  it("懸空引用照印顯示名、不加括號；另外記一筆 missingRefs（診斷用，不參與渲染）", () => {
    const gone = { locationId: mintLocationId(), displayName: "頂樓" };
    const ghost = { characterId: mintCharacterId(), displayName: "老人" };
    const s = scene(filled({ location: gone, appearingCharacters: [ming, ghost] }));
    const known = scene(filled({ location: dolphin }));
    const { rows, missingRefs } = labelSceneTable(projectSceneTable(makeDoc(known, s)), names);

    expect(rows[1]).toMatchObject({ location: "頂樓", appearingCharacters: "小明（男子）、老人" });
    expect(missingRefs).toEqual([
      { sceneId: s.attrs.sceneId, kind: "location", id: gone.locationId, displayName: "頂樓" },
      { sceneId: s.attrs.sceneId, kind: "character", id: ghost.characterId, displayName: "老人" },
    ]);
  });

  it("引用都在時 missingRefs 是空的", () => {
    const doc = makeDoc(scene(filled({ location: dolphin, appearingCharacters: [ming] })));
    expect(labelSceneTable(projectSceneTable(doc), names).missingRefs).toEqual([]);
  });
});
