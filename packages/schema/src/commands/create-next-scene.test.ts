import { describe, expect, it } from "vitest";

import { isSceneId } from "../ids";
import { makeDoc, makeScene } from "../testing";
import { createNextScene } from "./create-next-scene";
import { topLevelScenes } from "./identity";

const idsOf = (doc: ReturnType<typeof makeDoc>) =>
  topLevelScenes(doc).map((e) => e.node.attrs.sceneId as string);

describe("createNextScene", () => {
  it("是純函式：不改動輸入 doc", () => {
    const doc = makeDoc(makeScene());
    const before = doc.toJSON();
    createNextScene(doc);
    expect(doc.toJSON()).toEqual(before);
  });

  it("省略 afterSceneId → 接在全劇最後", () => {
    const a = makeScene();
    const doc = makeDoc(a);
    const r = createNextScene(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = idsOf(r.value);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(a.attrs.sceneId);
  });

  it("afterSceneId 指定時插在該場之後、其餘場次順序與身分不變", () => {
    const [a, b, c] = [makeScene(), makeScene(), makeScene()];
    const doc = makeDoc(a, b, c);
    const r = createNextScene(doc, { afterSceneId: b.attrs.sceneId as string });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = idsOf(r.value);
    expect(ids).toEqual([
      a.attrs.sceneId,
      b.attrs.sceneId,
      ids[2], // 新場次
      c.attrs.sceneId,
    ]);
    expect(ids[2]).not.toBe(c.attrs.sceneId);
  });

  it("新場次帶一個新鑄的 sceneId（sc_ 前綴、與既有場次都不同）", () => {
    const a = makeScene();
    const r = createNextScene(makeDoc(a));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [id0, id1] = idsOf(r.value);
    expect(isSceneId(id1)).toBe(true);
    expect(id1).not.toBe(id0);
  });

  it("新場次是合法的空場次：單一 action 區塊、metadata 為 schema 預設", () => {
    const r = createNextScene(makeDoc(makeScene()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fresh = topLevelScenes(r.value)[1]!.node;
    expect(fresh.childCount).toBe(1);
    expect(fresh.child(0).type.name).toBe("action");
    expect(fresh.attrs.time).toBe(null);
    expect(fresh.attrs.manualDraft).toBe(false);
  });

  it("afterSceneId 找不到 → 回傳拒絕，不 throw", () => {
    const r = createNextScene(makeDoc(makeScene()), { afterSceneId: "sc_nope" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("sc_nope");
  });

  it("空 doc 也能建立第一場", () => {
    const r = createNextScene(makeDoc());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idsOf(r.value)).toHaveLength(1);
  });
});
