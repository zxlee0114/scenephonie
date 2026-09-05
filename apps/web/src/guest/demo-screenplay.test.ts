import { describe, expect, it } from "vitest";

import { docFromJSON } from "@scenephonie/schema";

import { demoScreenplay } from "./demo-screenplay";

/**
 * 範例稿是**要落庫的資料**，不是畫面上的文案 —— 所以它受的檢查與使用者自己寫的稿一樣：
 * hydrate 得起來、每一份都是獨立的一份。
 */
describe("訪客的範例稿", () => {
  it("是一份 hydrate 得起來的 doc", () => {
    // 寫入邊界的同一道關卡（見 screenplays 的 Server Action）：`sceneId` 無 default、
    // 列舉欄位有 validator，所以壞掉的種子在這裡就會炸，不會變成一批壞掉的訪客稿。
    const doc = docFromJSON(demoScreenplay());

    expect(doc.childCount).toBeGreaterThan(0);
    doc.forEach((scene) => {
      expect(scene.type.name).toBe("scene");
      expect(scene.childCount).toBeGreaterThan(0);
    });
  });

  it("每一份都有自己的 `sceneId` —— 兩個訪客不共用任何識別碼", () => {
    const sceneIdsOf = (doc: Record<string, unknown>): string[] =>
      (doc.content as { attrs: { sceneId: string } }[]).map((scene) => scene.attrs.sceneId);

    const first = sceneIdsOf(demoScreenplay());
    const second = sceneIdsOf(demoScreenplay());

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });

  it("是 plain object —— 過得了 RSC 邊界", () => {
    // `editor/empty-screenplay.ts` 同一條理由：null-prototype 的 attrs 在 server→client
    // 直接丟錯，client→server 更糟（靜默吃掉 attr）。
    const doc = demoScreenplay();
    const attrs = (doc.content as { attrs: object }[])[0]?.attrs;

    expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
  });
});
