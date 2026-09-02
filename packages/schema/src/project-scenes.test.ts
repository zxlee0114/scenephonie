import { describe, expect, it } from "vitest";

import { mintSceneId } from "./ids";
import { docFromJSON, projectScenes } from "./project-scenes";
import { schema } from "./schema";

function scene(sceneId: string) {
  return schema.node("scene", { sceneId }, schema.node("action", null, [schema.text("內容")]));
}

describe("projectScenes", () => {
  it("多場次 doc 依文件順序推導出 1..N", () => {
    const ids = [mintSceneId(), mintSceneId(), mintSceneId()];
    const doc = schema.node("doc", null, ids.map(scene));

    expect(projectScenes(doc)).toEqual([
      { sceneId: ids[0], number: 1 },
      { sceneId: ids[1], number: 2 },
      { sceneId: ids[2], number: 3 },
    ]);
  });

  it("序號跟著文件順序走，不跟著 sceneId 的字典序", () => {
    const a = "sc_zzz";
    const b = "sc_aaa";
    const doc = schema.node("doc", null, [scene(a), scene(b)]);
    expect(projectScenes(doc).map((s) => s.number)).toEqual([1, 2]);
    expect(projectScenes(doc)[0]!.sceneId).toBe(a);
  });

  it("是純函式 —— 不改動輸入 doc，重複呼叫結果相同", () => {
    const doc = schema.node("doc", null, [scene(mintSceneId()), scene(mintSceneId())]);
    const before = doc.toJSON();
    const first = projectScenes(doc);
    const second = projectScenes(doc);
    expect(first).toEqual(second);
    expect(doc.toJSON()).toEqual(before);
  });

  it("推導值不進 doc —— doc 的 JSON 裡沒有場次號欄位", () => {
    const doc = schema.node("doc", null, [scene(mintSceneId())]);
    projectScenes(doc);
    const json = JSON.stringify(doc.toJSON());
    expect(json).not.toMatch(/number|場次號|sceneNumber/);
  });
});

describe("docFromJSON（讀取邊界入口）", () => {
  it("hydrate 持久化 JSON 後可直接餵給 projectScenes", () => {
    const id = mintSceneId();
    const persisted = schema.node("doc", null, [scene(id)]).toJSON();

    const doc = docFromJSON(persisted);
    expect(projectScenes(doc)).toEqual([{ sceneId: id, number: 1 }]);
  });
});
