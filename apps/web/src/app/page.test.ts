import { describe, expect, it } from "vitest";

import { docFromJSON, mintSceneId, projectScenes, schema } from "@scenephonie/schema";

/**
 * Smoke —— 證明 app 能跨套件邊界 import isomorphic schema kernel，
 * 且 schema／推導函式在 Node 環境（vitest `environment: "node"`）下可執行。
 */
describe("apps/web ↔ @scenephonie/schema 邊界", () => {
  it("app 能 import 並執行 isomorphic schema 套件", () => {
    const id = mintSceneId();
    const persisted = schema
      .node("doc", null, [schema.node("scene", { sceneId: id }, schema.node("action"))])
      .toJSON();

    expect(projectScenes(docFromJSON(persisted))).toEqual([{ sceneId: id, number: 1 }]);
  });
});
