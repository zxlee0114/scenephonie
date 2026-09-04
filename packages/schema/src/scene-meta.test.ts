import { describe, expect, it } from "vitest";

import { hasEmptySceneMeta } from "./scene-meta";
import { nullableSceneAttrNames } from "./schema";
import { makeScene } from "./testing";

describe("hasEmptySceneMeta（票券 31）", () => {
  it("剛建好的場次：metadata 全空", () => {
    expect(hasEmptySceneMeta(makeScene())).toBe(true);
  });

  it.each([...nullableSceneAttrNames])("填了 `%s` 就不算全空", (name) => {
    const filled: Record<string, unknown> = {
      time: "日",
      intExt: "內景",
      location: { locationId: null, displayName: "廚房" },
      appearingCharacters: [{ characterId: "ch_1", displayName: "小明" }],
    };
    expect(hasEmptySceneMeta(makeScene({ [name]: filled[name] }))).toBe(false);
  });

  it("登場人物的空陣列等同沒填（「沒有」不是「填過」）", () => {
    expect(hasEmptySceneMeta(makeScene({ appearingCharacters: [] }))).toBe(true);
  });

  it("不看內文，也不看 extras／manualDraft（不參與 metadata 判定）", () => {
    expect(hasEmptySceneMeta(makeScene({ manualDraft: true }, "已經寫了戲"))).toBe(true);
  });
});
