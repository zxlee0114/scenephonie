/**
 * 交付的 payload（票券 17，§4.9、ADR-0008）—— **存推導的結果，不存推導的輸入。**
 *
 * `projectDelivery(doc, names)` 是建立交付那個交易裡唯一的推導：場次號、草稿排除、閱讀順序、
 * 折返與對剪都在這裡算完一次，之後誰都不准重算（不變式 E）。payload 自己讀得懂 —— 沒有
 * 場次樹、沒有 doc，一筆交付能獨立重建它承諾的語意。
 */
import { describe, expect, it } from "vitest";

import { mintCharacterId, mintLocationId } from "./entities";
import { DELIVERY_PAYLOAD_VERSION, projectDelivery } from "./delivery";
import { block, filled, fragmentOf, groupWith, makeDoc, memberWith, sceneWith, subsceneWith } from "./testing";

const noNames = { characters: new Map<string, string>(), locations: new Map<string, string>() };

describe("projectDelivery：場次清單", () => {
  it("一場正式場次：場次號、景、光、地點與人物的「實體名＋顯示名」快照、群演印好的字", () => {
    const locationId = mintLocationId();
    const characterId = mintCharacterId();
    const s = sceneWith([block.action("走進房間")], {
      time: "夜",
      intExt: "內景",
      location: { locationId, displayName: "未知大樓房間" },
      appearingCharacters: [{ characterId, displayName: "男子" }],
      extras: [{ extraId: "ex_1", description: "路人", countValue: { kind: "exact", count: 3 } }],
    });
    const names = {
      characters: new Map([[characterId, "小明"]]),
      locations: new Map([[locationId, "海豚公寓房間"]]),
    };

    expect(projectDelivery(makeDoc(s), names)).toEqual({
      version: DELIVERY_PAYLOAD_VERSION,
      scenes: [
        {
          sceneId: s.attrs.sceneId,
          label: "1",
          intExt: "內景",
          time: "夜",
          locations: [{ name: "海豚公寓房間", displayName: "未知大樓房間" }],
          appearingCharacters: [{ name: "小明", displayName: "男子" }],
          extras: "路人（3）",
        },
      ],
      script: [
        { type: "heading", sceneId: s.attrs.sceneId },
        { type: "action", text: "走進房間" },
      ],
    });
  });

  it("懸空引用照印顯示名，實體名記成 null（不擋、不少印）", () => {
    const s = sceneWith([block.action("走進房間")], filled({ location: { locationId: mintLocationId(), displayName: "客廳" } }));
    expect(projectDelivery(makeDoc(s), noNames).scenes[0]!.locations).toEqual([{ name: null, displayName: "客廳" }]);
  });
});

const scene = (blocks = [block.action("走進房間")], attrs: Record<string, unknown> = filled()) =>
  sceneWith(blocks, attrs);

describe("projectDelivery：閱讀順序的內文", () => {
  it("草稿整場不進交付 —— 不在場次清單、內文裡也沒有它；後面的正式場次照樣是它的正式號", () => {
    const draft = scene([block.action("還沒想好")], filled({ time: null }));
    const second = scene([block.action("出門")]);
    const payload = projectDelivery(makeDoc(scene(), draft, second), noNames);

    expect(payload.scenes.map((s) => s.label)).toEqual(["1", "2"]);
    expect(payload.script).not.toContainEqual({ type: "action", text: "還沒想好" });
    expect(payload.script.slice(-2)).toEqual([
      { type: "heading", sceneId: second.attrs.sceneId },
      { type: "action", text: "出門" },
    ]);
  });

  it("對白帶說話者的顯示名與發聲方式；插入畫面是自己的元素", () => {
    const s = scene([
      block.action("門開了"),
      block.dialogue("回來了", { character: { id: mintCharacterId(), displayName: "小明" }, voiceStyle: "V.O." }),
      block.insertShot("桌上的信"),
    ]);
    expect(projectDelivery(makeDoc(s), noNames).script.slice(1)).toEqual([
      { type: "action", text: "門開了" },
      { type: "dialogue", speaker: "小明", voiceStyle: "V.O.", text: "回來了" },
      { type: "insertShot", text: "桌上的信" },
    ]);
  });

  it("空區塊不算內容，不進交付", () => {
    const s = scene([block.action("門開了"), block.action("  "), block.dialogue("")]);
    expect(projectDelivery(makeDoc(s), noNames).script.slice(1)).toEqual([{ type: "action", text: "門開了" }]);
  });
});

const sub = (text: string, attrs: Record<string, unknown> = filled({ time: "夜" })) =>
  subsceneWith([block.action(text)], { kind: "插入", ...attrs });

describe("projectDelivery：子場次與折返", () => {
  it("子場次有自己的標題與場次號；回到主場次內容時記一筆折返，印主場次地點的顯示名", () => {
    const flashback = sub("二十年前");
    const parent = scene(
      [block.action("走進房間"), flashback, block.action("回過神來")],
      filled({ location: { locationId: mintLocationId(), displayName: "公寓客廳" } }),
    );
    const payload = projectDelivery(makeDoc(parent), noNames);

    expect(payload.scenes.map((s) => [s.label, s.parentSceneId])).toEqual([
      ["1", undefined],
      ["1.1", parent.attrs.sceneId],
    ]);
    expect(payload.script).toEqual([
      { type: "heading", sceneId: parent.attrs.sceneId },
      { type: "action", text: "走進房間" },
      { type: "heading", sceneId: flashback.attrs.sceneId },
      { type: "action", text: "二十年前" },
      { type: "returnTo", sceneId: parent.attrs.sceneId, location: "公寓客廳" },
      { type: "action", text: "回過神來" },
    ]);
  });

  it("兩個子場次相鄰不記折返；空區塊不算回到主場次", () => {
    const a = sub("甲");
    const b = sub("乙", filled({ time: "昏" }));
    const parent = scene([block.action("走進房間"), a, block.action(" "), b]);
    expect(projectDelivery(makeDoc(parent), noNames).script.map((e) => e.type)).toEqual([
      "heading",
      "action",
      "heading",
      "action",
      "heading",
      "action",
    ]);
  });

  it("草稿子場次整段不進交付，也不因為它而記折返", () => {
    const draft = sub("還沒想好", filled({ time: null }));
    const parent = scene([block.action("走進房間"), draft, block.action("接著走")]);
    expect(projectDelivery(makeDoc(parent), noNames).script).toEqual([
      { type: "heading", sceneId: parent.attrs.sceneId },
      { type: "action", text: "走進房間" },
      { type: "action", text: "接著走" },
    ]);
  });
});

describe("projectDelivery：對剪", () => {
  it("先建立、再宣告、再交錯：成員各自的標題 → 對剪 → 依片段順序交錯，每段記它歸屬的成員", () => {
    const a = memberWith(filled());
    const b = memberWith(filled({ time: "夜" }));
    const group = groupWith(
      [a, b],
      [fragmentOf(a, [block.action("甲撥號")]), fragmentOf(b, [block.action("乙接起")]), fragmentOf(a, [block.action("甲掛斷")])],
    );
    const payload = projectDelivery(makeDoc(scene(), group), noNames);

    expect(payload.scenes.slice(1).map((s) => [s.label, s.groupId])).toEqual([
      ["2", group.attrs.groupId],
      ["3", group.attrs.groupId],
    ]);
    expect(payload.script.slice(2)).toEqual([
      { type: "heading", sceneId: a.attrs.sceneId },
      { type: "heading", sceneId: b.attrs.sceneId },
      { type: "intercut", groupId: group.attrs.groupId },
      { type: "fragment", sceneId: a.attrs.sceneId, location: "客廳", disambiguateBy: ["time"] },
      { type: "action", text: "甲撥號" },
      { type: "fragment", sceneId: b.attrs.sceneId, location: "客廳", disambiguateBy: ["time"] },
      { type: "action", text: "乙接起" },
      { type: "fragment", sceneId: a.attrs.sceneId, location: "客廳", disambiguateBy: ["time"] },
      { type: "action", text: "甲掛斷" },
    ]);
  });

  it("成員的子場次在片段裡；折返回到的是片段所屬的成員", () => {
    const a = memberWith(filled({ location: { locationId: mintLocationId(), displayName: "電話亭" } }));
    const b = memberWith(filled({ time: "夜" }));
    const memory = sub("想起那天");
    const group = groupWith(
      [a, b],
      [fragmentOf(a, [block.action("甲撥號"), memory, block.action("甲回神")]), fragmentOf(b, [block.action("乙接起")])],
    );
    const payload = projectDelivery(makeDoc(group), noNames);

    expect(payload.scenes.map((s) => s.label)).toEqual(["1", "1.1", "2"]);
    expect(payload.script.slice(3, 9)).toEqual([
      { type: "fragment", sceneId: a.attrs.sceneId, location: "電話亭", disambiguateBy: [] },
      { type: "action", text: "甲撥號" },
      { type: "heading", sceneId: memory.attrs.sceneId },
      { type: "action", text: "想起那天" },
      { type: "returnTo", sceneId: a.attrs.sceneId, location: "電話亭" },
      { type: "action", text: "甲回神" },
    ]);
  });

  it("有一個成員是草稿，整個群組不進交付（殘缺的對剪比不印更糟，§9.6）；場次號跳號，與編輯器一致", () => {
    const a = memberWith(filled());
    const draft = memberWith(filled({ time: null }));
    const group = groupWith([a, draft], [fragmentOf(a, [block.action("甲撥號")]), fragmentOf(draft, [block.action("乙接起")])]);
    const after = scene([block.action("散場")]);
    const payload = projectDelivery(makeDoc(scene(), group, after), noNames);

    expect(payload.scenes.map((s) => s.label)).toEqual(["1", "3"]);
    expect(payload.script.map((e) => (e.type === "action" ? e.text : e.type))).toEqual(["heading", "走進房間", "heading", "散場"]);
  });

  it("片段的歸屬記好地點；兩個成員地點顯示名相同時，記下要補印哪一欄來區別", () => {
    const sameRoom = () => ({ locationId: mintLocationId(), displayName: "公寓客廳" });
    const day = memberWith(filled({ location: sameRoom(), time: "日" }));
    const night = memberWith(filled({ location: sameRoom(), time: "夜" }));
    const street = memberWith(filled({ location: { locationId: mintLocationId(), displayName: "街口" }, intExt: "外景" }));
    const group = groupWith(
      [day, night, street],
      [fragmentOf(day, [block.action("白天")]), fragmentOf(night, [block.action("晚上")]), fragmentOf(street, [block.action("路口")])],
    );
    const fragments = projectDelivery(makeDoc(group), noNames).script.filter((e) => e.type === "fragment");

    expect(fragments).toEqual([
      { type: "fragment", sceneId: day.attrs.sceneId, location: "公寓客廳", disambiguateBy: ["time"] },
      { type: "fragment", sceneId: night.attrs.sceneId, location: "公寓客廳", disambiguateBy: ["time"] },
      { type: "fragment", sceneId: street.attrs.sceneId, location: "街口", disambiguateBy: [] },
    ]);
  });
});

describe("projectDelivery：payload 自己讀得懂", () => {
  it("是純 JSON —— 存進 jsonb 再讀回來一字不差，不必 hydrate、不必遷移", () => {
    const a = memberWith(filled());
    const b = memberWith(filled({ time: "夜" }));
    const doc = makeDoc(
      scene([block.action("走進房間"), sub("二十年前"), block.dialogue("回來了", { character: { id: mintCharacterId(), displayName: "小明" } })]),
      groupWith([a, b], [fragmentOf(a, [block.action("甲")]), fragmentOf(b, [block.action("乙")])]),
    );
    const payload = projectDelivery(doc, noNames);

    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});
