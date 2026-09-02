import { describe, expect, it } from "vitest";

import { mintSceneId } from "./ids";
import { docFromJSON, projectScenes } from "./project-scenes";
import { makeDoc, makeScene } from "./testing";

const sceneWithId = (sceneId: string) => makeScene({ sceneId });

describe("projectScenes", () => {
  it("多場次 doc 依文件順序推導出 1..N", () => {
    const ids = [mintSceneId(), mintSceneId(), mintSceneId()];
    const doc = makeDoc(...ids.map(sceneWithId));

    expect(projectScenes(doc)).toEqual([
      { sceneId: ids[0], number: 1 },
      { sceneId: ids[1], number: 2 },
      { sceneId: ids[2], number: 3 },
    ]);
  });

  it("序號跟著文件順序走，不跟著 sceneId 的字典序", () => {
    const doc = makeDoc(sceneWithId("sc_zzz"), sceneWithId("sc_aaa"));
    expect(projectScenes(doc).map((s) => s.number)).toEqual([1, 2]);
    expect(projectScenes(doc)[0]!.sceneId).toBe("sc_zzz");
  });

  it("是純函式 —— 不改動輸入 doc，重複呼叫結果相同", () => {
    const doc = makeDoc(sceneWithId(mintSceneId()), sceneWithId(mintSceneId()));
    const before = doc.toJSON();
    expect(projectScenes(doc)).toEqual(projectScenes(doc));
    expect(doc.toJSON()).toEqual(before);
  });

  it("推導值不進 doc —— doc 的 JSON 裡沒有場次號欄位", () => {
    const doc = makeDoc(sceneWithId(mintSceneId()));
    projectScenes(doc);
    expect(JSON.stringify(doc.toJSON())).not.toMatch(/number|場次號|sceneNumber/);
  });

  it("空 doc 得到空序列", () => {
    expect(projectScenes(makeDoc())).toEqual([]);
  });
});

describe("docFromJSON（讀取邊界入口）", () => {
  it("hydrate 持久化 JSON 後可直接餵給 projectScenes", () => {
    const id = mintSceneId();
    const persisted = makeDoc(sceneWithId(id)).toJSON();

    const doc = docFromJSON(persisted);
    expect(projectScenes(doc)).toEqual([{ sceneId: id, number: 1 }]);
  });
});
