import { describe, expect, it } from "vitest";

import { makeDoc, makeScene } from "../testing";
import { topLevelScenes } from "./identity";
import { moveScene } from "./move-scene";

const idsOf = (doc: ReturnType<typeof makeDoc>) =>
  topLevelScenes(doc).map((e) => e.node.attrs.sceneId as string);

describe("moveScene", () => {
  const build = () => {
    const scenes = [makeScene(), makeScene(), makeScene(), makeScene()];
    return { scenes, doc: makeDoc(...scenes), ids: scenes.map((s) => s.attrs.sceneId as string) };
  };

  it("是純函式：不改動輸入 doc", () => {
    const { doc, ids } = build();
    const before = doc.toJSON();
    moveScene(doc, { sceneId: ids[1]!, target: { position: "start" } });
    expect(doc.toJSON()).toEqual(before);
  });

  it("position: before —— 搬到某場之前", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: ids[3]!, target: { position: "before", refSceneId: ids[1]! } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idsOf(r.value)).toEqual([ids[0], ids[3], ids[1], ids[2]]);
  });

  it("position: after —— 搬到某場之後", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: ids[0]!, target: { position: "after", refSceneId: ids[2]! } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idsOf(r.value)).toEqual([ids[1], ids[2], ids[0], ids[3]]);
  });

  it("position: start / end", () => {
    const { doc, ids } = build();
    const toStart = moveScene(doc, { sceneId: ids[2]!, target: { position: "start" } });
    const toEnd = moveScene(doc, { sceneId: ids[1]!, target: { position: "end" } });
    expect(toStart.ok && idsOf(toStart.value)).toEqual([ids[2], ids[0], ids[1], ids[3]]);
    expect(toEnd.ok && idsOf(toEnd.value)).toEqual([ids[0], ids[2], ids[3], ids[1]]);
  });

  it("搬移全程保住每個場次的 sceneId（不變式 ⑦ —— 搬移不是鑄造時刻）", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: ids[0]!, target: { position: "end" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...idsOf(r.value)].sort()).toEqual([...ids].sort());
  });

  it("搬到原地 → 序列不變（不是錯誤）", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: ids[1]!, target: { position: "after", refSceneId: ids[0]! } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idsOf(r.value)).toEqual(ids);
  });

  it("非法目標：找不到要搬的 sceneId → 拒絕（不靠 UI 擋）", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: "sc_ghost", target: { position: "before", refSceneId: ids[0]! } });
    expect(r.ok).toBe(false);
  });

  it("非法目標：參考 sceneId 不存在 → 拒絕", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: ids[0]!, target: { position: "before", refSceneId: "sc_ghost" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("非法目標");
  });

  it("非法目標：搬到相對於自己的位置 → 拒絕", () => {
    const { doc, ids } = build();
    const r = moveScene(doc, { sceneId: ids[0]!, target: { position: "after", refSceneId: ids[0]! } });
    expect(r.ok).toBe(false);
  });
});
