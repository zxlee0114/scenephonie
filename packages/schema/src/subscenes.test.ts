import { describe, expect, it } from "vitest";

import { mintCharacterId, mintLocationId } from "./entities";
import { projectScenes } from "./project-scenes";
import { returnMarkers, subsceneEchoesParent, subsceneTimeOptions } from "./subscenes";
import { block, filled, makeDoc, sceneWith, subsceneWith } from "./testing";

const living = { locationId: mintLocationId(), displayName: "公寓客廳" };
const balcony = { locationId: mintLocationId(), displayName: "陽台" };
const sub = (text = "陽台", attrs: Record<string, unknown> = {}) =>
  subsceneWith([block.action(text)], { kind: "接續", ...attrs });

describe("projectScenes：子場次號 5.1（推導值，不進 doc）", () => {
  it("子場次接在主場次之後編成「父場次號．第幾個子場次」", () => {
    const s1 = sub("陽台", filled());
    const s2 = sub("廚房", filled());
    const first = sceneWith([block.action("a")], filled());
    const parent = sceneWith([block.action("客廳"), s1, block.action("回來"), s2], filled());
    const doc = makeDoc(first, parent, sceneWith([block.action("c")], filled()));

    expect(projectScenes(doc).map((s) => s.label)).toEqual(["1", "2", "2.1", "2.2", "3"]);
    const entry = projectScenes(doc).find((s) => s.sceneId === s2.attrs.sceneId)!;
    expect(entry).toMatchObject({ number: 2, parentSceneId: parent.attrs.sceneId, label: "2.2" });
  });

  it("主場次的號碼不因子場次而跳號", () => {
    const doc = makeDoc(
      sceneWith([block.action("a"), sub("陽台", filled())], filled()),
      sceneWith([block.action("b")], filled()),
    );
    expect(projectScenes(doc).filter((s) => s.parentSceneId == null).map((s) => s.number)).toEqual([1, 2]);
  });
});

describe("returnMarkers：折返標記（§9.4 推導規則）", () => {
  it("子場次之後回到主場次的非空內容 → 印「回到　主場次地點」", () => {
    const scene = sceneWith([block.action("客廳"), sub(), block.action("回來")], { location: living });
    expect(returnMarkers(scene)).toEqual([{ blockIndex: 2, location: "公寓客廳" }]);
  });

  it("兩個子場次相鄰時不印", () => {
    const scene = sceneWith([block.action("客廳"), sub(), sub("廚房")], { location: living });
    expect(returnMarkers(scene)).toEqual([]);
  });

  it("空區塊不算內容：夾在兩個子場次之間的空區塊不印，標記落在之後第一個非空區塊", () => {
    const scene = sceneWith(
      [block.action("客廳"), sub(), block.action(""), sub("廚房"), block.dialogue(""), block.action("回來")],
      { location: living },
    );
    expect(returnMarkers(scene)).toEqual([{ blockIndex: 5, location: "公寓客廳" }]);
  });

  it("剛跳出子場次的空區塊不印（畫面不會自己閃一下）", () => {
    const scene = sceneWith([block.action("客廳"), sub(), block.action("")], { location: living });
    expect(returnMarkers(scene)).toEqual([]);
  });

  it("每一次折返各印一次", () => {
    const scene = sceneWith(
      [block.action("a"), sub(), block.action("b"), block.action("b2"), sub("廚房"), block.action("c")],
      { location: living },
    );
    expect(returnMarkers(scene).map((m) => m.blockIndex)).toEqual([2, 5]);
  });

  it("沒有子場次就沒有標記", () => {
    expect(returnMarkers(sceneWith([block.action("a"), block.action("b")]))).toEqual([]);
  });

  it("印的是地點顯示名，不是場次號；地點還沒填時 location 為 null", () => {
    const named = sceneWith([block.action("a"), sub(), block.action("b")], {
      location: { ...living, displayName: "阿強家" },
    });
    expect(returnMarkers(named)[0]!.location).toBe("阿強家");
    const unnamed = sceneWith([block.action("a"), sub(), block.action("b")]);
    expect(returnMarkers(unnamed)[0]!.location).toBeNull();
  });
});

describe("不變式 ②：子場次的 metadata 不得與主場次完全相同", () => {
  const who = [{ characterId: mintCharacterId(), displayName: "小明" }];
  const meta = { time: "夜", intExt: "內景", location: living, appearingCharacters: who };

  it("四欄完全相同 → 相同（視為不完整 → 自動草稿，票券 14 接）", () => {
    const parent = sceneWith([block.action("a")], meta);
    expect(subsceneEchoesParent(parent, sub("x", meta))).toBe(true);
  });

  it("比的是引用的 id，不是顯示名（別名不改變時空）", () => {
    const parent = sceneWith([block.action("a")], meta);
    const aliased = sub("x", { ...meta, location: { ...living, displayName: "客廳" } });
    expect(subsceneEchoesParent(parent, aliased)).toBe(true);
  });

  it("任何一欄不同就不是", () => {
    const parent = sceneWith([block.action("a")], meta);
    expect(subsceneEchoesParent(parent, sub("x", { ...meta, location: balcony }))).toBe(false);
    expect(subsceneEchoesParent(parent, sub("x", { ...meta, time: "日" }))).toBe(false);
    expect(subsceneEchoesParent(parent, sub("x", { ...meta, appearingCharacters: null }))).toBe(false);
  });

  it("兩邊都空著也是相同（剛建立、沒動過的子場次本來就是草稿）", () => {
    const parent = sceneWith([block.action("a")]);
    expect(subsceneEchoesParent(parent, sub())).toBe(true);
  });
});

describe("subsceneTimeOptions：時間下拉依種類排序（§7.4）", () => {
  it("接續：主場次的值置頂並標注為原場次", () => {
    expect(subsceneTimeOptions("接續", "夜")).toEqual({ options: ["夜", "日", "晨", "昏"], origin: "夜" });
  });

  it("插入：只標注，不置頂", () => {
    expect(subsceneTimeOptions("插入", "夜")).toEqual({ options: ["日", "夜", "晨", "昏"], origin: "夜" });
  });

  it("主場次時間還沒填：照原本的順序，沒有標注", () => {
    expect(subsceneTimeOptions("接續", null)).toEqual({ options: ["日", "夜", "晨", "昏"], origin: null });
  });
});
