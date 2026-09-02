import { describe, expect, it } from "vitest";

import { projectSceneNumbers } from "@scenephonie/schema";

/**
 * Smoke —— 證明 app 能跨套件邊界 import isomorphic schema kernel，
 * 且它在 Node 環境（vitest `environment: "node"`）下可執行。
 */
describe("apps/web ↔ @scenephonie/schema 邊界", () => {
  it("app 能 import 並執行 isomorphic schema 套件", () => {
    expect(projectSceneNumbers(2)).toEqual([1, 2]);
  });
});
