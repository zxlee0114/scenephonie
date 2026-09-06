import { describe, expect, it } from "vitest";

import { docFromJSON, sceneLocations } from "@scenephonie/schema";

import {
  DEMO_CHARACTER_NAMES,
  DEMO_LOCATION_NAMES,
  demoScreenplay,
  type DemoEntityIds,
} from "./demo-screenplay";

/**
 * 呼叫端真的會先把實體建出來（`guest/guest-entry.ts`），這裡用假 id 模擬那一步 ——
 * 這個測試檔問的是「拿到 id 之後組出來的稿對不對」。
 */
const ids = (names: readonly string[], prefix: string) =>
  Object.fromEntries(names.map((name, i) => [name, `${prefix}${i}`]));

const seeded: DemoEntityIds = {
  locations: ids(DEMO_LOCATION_NAMES, "lo_"),
  characters: ids(DEMO_CHARACTER_NAMES, "ch_"),
};

/**
 * 範例稿是**要落庫的資料**，不是畫面上的文案 —— 所以它受的檢查與使用者自己寫的稿一樣：
 * hydrate 得起來、每一份都是獨立的一份。
 */
describe("訪客的範例稿", () => {
  it("是一份 hydrate 得起來的 doc", () => {
    // 寫入邊界的同一道關卡（見 screenplays 的 Server Action）：`sceneId` 無 default、
    // 列舉欄位有 validator，所以壞掉的種子在這裡就會炸，不會變成一批壞掉的訪客稿。
    const doc = docFromJSON(demoScreenplay(seeded));

    expect(doc.childCount).toBeGreaterThan(0);
    doc.forEach((scene) => {
      expect(scene.type.name).toBe("scene");
      expect(scene.childCount).toBeGreaterThan(0);
    });
  });

  it("每一份都有自己的 `sceneId` —— 兩個訪客不共用任何識別碼", () => {
    const sceneIdsOf = (doc: Record<string, unknown>): string[] =>
      (doc.content as { attrs: { sceneId: string } }[]).map((scene) => scene.attrs.sceneId);

    const first = sceneIdsOf(demoScreenplay(seeded));
    const second = sceneIdsOf(demoScreenplay(seeded));

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });

  it("每一筆引用都指向真的實體 —— 範例稿自己也要滿足不變式 ⑧", () => {
    const doc = docFromJSON(demoScreenplay(seeded));
    const known = new Set([
      ...Object.values(seeded.locations),
      ...Object.values(seeded.characters),
    ]);

    const referenced: string[] = [];
    doc.descendants((node) => {
      for (const ref of sceneLocations(node.attrs.location)) referenced.push(ref.locationId);
      const speaker = node.attrs.character as { id?: string } | null;
      if (node.type.name === "dialogue" && speaker?.id) referenced.push(speaker.id);
    });

    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.filter((id) => !known.has(id))).toEqual([]);
  });

  it("登場人物欄仍然留空 —— 判準是入鏡，範例不替編劇作答", () => {
    const doc = docFromJSON(demoScreenplay(seeded));
    doc.forEach((scene) => expect(scene.attrs.appearingCharacters).toBeNull());
  });

  it("是 plain object —— 過得了 RSC 邊界", () => {
    // `editor/empty-screenplay.ts` 同一條理由：null-prototype 的 attrs 在 server→client
    // 直接丟錯，client→server 更糟（靜默吃掉 attr）。
    const doc = demoScreenplay(seeded);
    const attrs = (doc.content as { attrs: object }[])[0]?.attrs;

    expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
  });
});
