/**
 * 分享頁場次表的預覽（票券 20 驗收）：點一列先看這一場寫了什麼，跟編輯器的場次表同一個手勢。
 * 編輯器從 doc 讀，分享頁只有交付投影 —— 這裡把一場的內文從 payload 的閱讀順序裡撿回來。
 */
import { describe, expect, it } from "vitest";

import { DELIVERY_PAYLOAD_VERSION, type DeliveredScene, type DeliveryPayload } from "@scenephonie/schema";

import { deliveredScenePreview } from "./delivered-preview";

const scene = (sceneId: string, label: string, extra: Partial<DeliveredScene> = {}): DeliveredScene => ({
  sceneId,
  label,
  intExt: "內景",
  time: "日",
  locations: [],
  appearingCharacters: [],
  extras: "",
  ...extra,
});

const payload: DeliveryPayload = {
  version: DELIVERY_PAYLOAD_VERSION,
  scenes: [
    scene("sc_a", "1"),
    scene("sc_a1", "1.1", { parentSceneId: "sc_a" }),
    scene("sc_g1", "2", { groupId: "gr_1" }),
    scene("sc_g2", "3", { groupId: "gr_1" }),
  ],
  script: [
    { type: "heading", sceneId: "sc_a" },
    { type: "action", text: "走進房間" },
    { type: "heading", sceneId: "sc_a1" },
    { type: "insertShot", text: "牆上的照片" },
    { type: "returnTo", sceneId: "sc_a", location: "房間" },
    { type: "dialogue", speaker: "小明", voiceStyle: "一般", text: "有人在嗎" },
    { type: "heading", sceneId: "sc_g1" },
    { type: "heading", sceneId: "sc_g2" },
    { type: "intercut", groupId: "gr_1" },
    { type: "fragment", sceneId: "sc_g1", location: "客廳", disambiguateBy: [] },
    { type: "action", text: "電話響" },
    { type: "fragment", sceneId: "sc_g2", location: "公司", disambiguateBy: [] },
    { type: "action", text: "撥號" },
    { type: "fragment", sceneId: "sc_g1", location: "客廳", disambiguateBy: [] },
    { type: "action", text: "接起來" },
  ],
};

describe("deliveredScenePreview", () => {
  it("主場次：自己的內文依文件順序，被子場次切開的那段標出是哪個子場次", () => {
    expect(deliveredScenePreview(payload, "sc_a")).toEqual([
      { blocks: [{ type: "action", text: "走進房間" }] },
      { subscene: { sceneId: "sc_a1" }, blocks: [{ type: "insertShot", text: "牆上的照片" }] },
      { blocks: [{ type: "dialogue", speaker: "小明", voiceStyle: "一般", text: "有人在嗎" }] },
    ]);
  });

  it("子場次自己一列：只有它的內文", () => {
    expect(deliveredScenePreview(payload, "sc_a1")).toEqual([
      { blocks: [{ type: "insertShot", text: "牆上的照片" }] },
    ]);
  });

  it("群組成員：接起屬於它的片段，跳過其他成員的", () => {
    expect(deliveredScenePreview(payload, "sc_g1")).toEqual([
      {
        blocks: [
          { type: "action", text: "電話響" },
          { type: "action", text: "接起來" },
        ],
      },
    ]);
  });

  it("不在交付裡的場次：空的", () => {
    expect(deliveredScenePreview(payload, "sc_x")).toEqual([]);
  });
});
