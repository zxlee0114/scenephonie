import { describe, expect, it } from "vitest";

import { isSceneId, mintSceneId, SCENE_ID_PREFIX } from "./ids";

describe("mintSceneId", () => {
  it("鑄造 `sc_` 前綴的 id", () => {
    expect(mintSceneId().startsWith("sc_")).toBe(true);
    expect(SCENE_ID_PREFIX).toBe("sc_");
  });

  it("前綴後有非空本體", () => {
    expect(mintSceneId().length).toBeGreaterThan(SCENE_ID_PREFIX.length);
  });

  it("全域唯一 —— 鑄造一萬個無碰撞", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => mintSceneId()));
    expect(ids.size).toBe(10_000);
  });
});

describe("isSceneId", () => {
  it("認得剛鑄造的 id", () => {
    expect(isSceneId(mintSceneId())).toBe(true);
  });

  it("擋掉前綴錯誤、空本體、非字串", () => {
    expect(isSceneId("gr_abc123")).toBe(false);
    expect(isSceneId("sc_")).toBe(false);
    expect(isSceneId("abc")).toBe(false);
    expect(isSceneId(null)).toBe(false);
    expect(isSceneId(undefined)).toBe(false);
    expect(isSceneId(123)).toBe(false);
  });
});
