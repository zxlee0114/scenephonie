import { describe, expect, it } from "vitest";

import { unlistedSpeakers } from "./appearing-prompt";
import { mintCharacterId } from "./entities";
import { mintExtraId } from "./extras";
import { block, sceneWith } from "./testing";

const xiaoming = mintCharacterId();
const xiaohua = mintCharacterId();

const says = (id: string | null, displayName: string, voiceStyle = "一般") =>
  block.dialogue("台詞", { character: { id, displayName }, voiceStyle });

describe("unlistedSpeakers（登場人物提示的觸發條件）", () => {
  it("有「一般」對白、不在登場人物欄 → 提示", () => {
    const scene = sceneWith([says(xiaoming, "小明")]);

    expect(unlistedSpeakers(scene, 0)).toEqual([{ id: xiaoming, displayName: "小明" }]);
  });

  it.each(["V.O.", "O.S."])("標了 %s 絕不提示 —— 編劇已經宣告他不入鏡", (voiceStyle) => {
    const scene = sceneWith([says(xiaoming, "小明", voiceStyle)]);

    expect(unlistedSpeakers(scene, 0)).toEqual([]);
  });

  it("已經在登場人物欄 → 不提示（顯示名不同也一樣：比的是實體）", () => {
    const scene = sceneWith([says(xiaoming, "男子")], {
      appearingCharacters: [{ characterId: xiaoming, displayName: "小明" }],
    });

    expect(unlistedSpeakers(scene, 0)).toEqual([]);
  });

  it("這一場選過「不新增」的人 → 不再提示", () => {
    const scene = sceneWith([says(xiaoming, "小明")], { dismissedCharacterIds: [xiaoming] });

    expect(unlistedSpeakers(scene, 0)).toEqual([]);
  });

  it("齊聲：兩個人各自判斷", () => {
    const scene = sceneWith([
      block.dialogue("生日快樂", {
        character: [
          { id: xiaoming, displayName: "小明" },
          { id: xiaohua, displayName: "小華" },
        ],
      }),
    ], { appearingCharacters: [{ characterId: xiaohua, displayName: "小華" }] });

    expect(unlistedSpeakers(scene, 0)).toEqual([{ id: xiaoming, displayName: "小明" }]);
  });

  it("群演齊聲不提示 —— 群演不是人物，那一欄的判準是入鏡的**人物**", () => {
    const extraId = mintExtraId();
    const scene = sceneWith([says(extraId, "眾人")], {
      extras: [{ extraId, description: "咖啡廳客人", countValue: { kind: "exact", count: 8 } }],
    });

    expect(unlistedSpeakers(scene, 0)).toEqual([]);
  });

  it("沒有 id 的過渡引用不提示 —— 沒有實體可以加進登場人物欄", () => {
    const scene = sceneWith([says(null, "小明")]);

    expect(unlistedSpeakers(scene, 0)).toEqual([]);
  });

  it("只看被問的那一句：別句的說話者不算進來", () => {
    const scene = sceneWith([says(xiaoming, "小明"), says(xiaohua, "小華")]);

    expect(unlistedSpeakers(scene, 1)).toEqual([{ id: xiaohua, displayName: "小華" }]);
  });

  it("不是對白、或序號超出範圍 → 空的", () => {
    const scene = sceneWith([block.action("走進房間")]);

    expect(unlistedSpeakers(scene, 0)).toEqual([]);
    expect(unlistedSpeakers(scene, 5)).toEqual([]);
  });

  it("壞掉的 dismissedCharacterIds 不讓提示整個壞掉（讀取容忍）", () => {
    const scene = sceneWith([says(xiaoming, "小明")], { dismissedCharacterIds: "ch_壞形狀" });

    expect(unlistedSpeakers(scene, 0)).toEqual([{ id: xiaoming, displayName: "小明" }]);
  });
});
