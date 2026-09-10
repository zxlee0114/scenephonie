/**
 * 實體的 id 形狀、目錄，與**讀取路徑容忍懸空引用**那一半（§6.6、ADR-0005）。
 */
import { describe, expect, it } from "vitest";

import {
  CHARACTER_ID_PREFIX,
  LOCATION_ID_PREFIX,
  entityDirectory,
  isCharacterId,
  isLocationId,
  mintCharacterId,
  mintLocationId,
  referenceLabel,
  sceneAppearingCharacters,
  sceneLocations,
} from "./entities";

describe("實體 id", () => {
  it("人物是 ch_、地點是 lo_，兩者互不相認", () => {
    const ch = mintCharacterId();
    const lo = mintLocationId();

    expect(ch.startsWith(CHARACTER_ID_PREFIX)).toBe(true);
    expect(lo.startsWith(LOCATION_ID_PREFIX)).toBe(true);
    expect(isCharacterId(lo)).toBe(false);
    expect(isLocationId(ch)).toBe(false);
  });

  it("光有前綴不算 id", () => {
    expect(isCharacterId("ch_")).toBe(false);
    expect(isLocationId(null)).toBe(false);
  });
});

describe("entityDirectory", () => {
  it("只認自己那一類 —— 人物 id 不會從地點那邊被認出來", () => {
    const ch = mintCharacterId();
    const directory = entityDirectory({ characterIds: [ch] });

    expect(directory.hasCharacter(ch)).toBe(true);
    expect(directory.hasLocation(ch)).toBe(false);
  });
});

describe("sceneLocations：單值 ｜ 陣列（僅雜景）｜ null 的讀取正規化", () => {
  const ref = { locationId: "lo_1", displayName: "海豚公寓房間" };

  it("三種形狀讀出來都是陣列", () => {
    expect(sceneLocations(null)).toEqual([]);
    expect(sceneLocations(ref)).toEqual([ref]);
    expect(sceneLocations([ref, { locationId: "lo_2", displayName: "派出所" }])).toHaveLength(2);
  });

  it("壞形狀不讓整份稿印不出來 —— 少讀一筆，不丟例外", () => {
    expect(sceneLocations([ref, "海豚公寓房間", 42, null])).toEqual([ref]);
  });

  it("懸空引用（實體已不在）照樣讀得出來 —— 讀取容忍是不變式 ⑧ 的另一半", () => {
    expect(sceneLocations({ locationId: "lo_已被⌘Z掉", displayName: "海豚公寓房間" })).toEqual([
      { locationId: "lo_已被⌘Z掉", displayName: "海豚公寓房間" },
    ]);
  });
});

describe("sceneAppearingCharacters", () => {
  it("null ＝ 尚未填，讀出來是空陣列", () => {
    expect(sceneAppearingCharacters(null)).toEqual([]);
  });
});

describe("referenceLabel：場次表的一格文字", () => {
  it("實體名與顯示名不同才印括號", () => {
    expect(referenceLabel("未知大樓房間", "海豚公寓房間")).toBe("海豚公寓房間（未知大樓房間）");
    expect(referenceLabel("小明", "小明")).toBe("小明");
  });

  it("懸空引用照印顯示名，不加括號、不少印", () => {
    expect(referenceLabel("海豚公寓房間", undefined)).toBe("海豚公寓房間");
    expect(referenceLabel("海豚公寓房間", null)).toBe("海豚公寓房間");
  });
});
