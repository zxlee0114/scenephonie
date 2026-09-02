import { describe, expect, it } from "vitest";

import { makeDoc } from "../testing";
import { block, sceneWith } from "../testing";
import { setBlockType } from "./set-block-type";
import { topLevelScenes } from "./identity";

function sceneAt(doc: ReturnType<typeof makeDoc>, i = 0) {
  return topLevelScenes(doc)[i]!.node;
}

describe("setBlockType", () => {
  it("是純函式：不改動輸入 doc", () => {
    const doc = makeDoc(sceneWith([block.action("走進房間")]));
    const before = doc.toJSON();
    setBlockType(doc, { sceneId: sceneAt(doc).attrs.sceneId as string, blockIndex: 0, type: "dialogue" });
    expect(doc.toJSON()).toEqual(before);
  });

  it("action → dialogue：保留 inline 內容，發聲方式補 schema 預設「一般」", () => {
    const s = sceneWith([block.action("你回來了")]);
    const doc = makeDoc(s);
    const r = setBlockType(doc, { sceneId: s.attrs.sceneId as string, blockIndex: 0, type: "dialogue" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = sceneAt(r.value).child(0);
    expect(b.type.name).toBe("dialogue");
    expect(b.textContent).toBe("你回來了");
    expect(b.attrs.發聲方式).toBe("一般");
    expect(b.attrs.人物).toBe(null);
  });

  it("dialogue → action：對白的 attr（人物／發聲方式）不帶過去", () => {
    const s = sceneWith([
      block.dialogue("我在這", { 人物: { id: "ch_1", 顯示名: "小明" }, 發聲方式: "V.O." }),
    ]);
    const doc = makeDoc(s);
    const r = setBlockType(doc, { sceneId: s.attrs.sceneId as string, blockIndex: 0, type: "action" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = sceneAt(r.value).child(0);
    expect(b.type.name).toBe("action");
    expect(b.textContent).toBe("我在這");
    expect(b.attrs.人物).toBeUndefined();
  });

  it("所在場次的 sceneId 與其他區塊原封不動（不變式 ⑦）", () => {
    const s = sceneWith([block.action("一"), block.action("二"), block.action("三")]);
    const doc = makeDoc(s);
    const r = setBlockType(doc, { sceneId: s.attrs.sceneId as string, blockIndex: 1, type: "insertShot" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const scene = sceneAt(r.value);
    expect(scene.attrs.sceneId).toBe(s.attrs.sceneId);
    expect(scene.child(0).textContent).toBe("一");
    expect(scene.child(1).type.name).toBe("insertShot");
    expect(scene.child(2).textContent).toBe("三");
  });

  it("已經是目標型別 → no-op，回傳原 doc", () => {
    const s = sceneWith([block.action("x")]);
    const doc = makeDoc(s);
    const r = setBlockType(doc, { sceneId: s.attrs.sceneId as string, blockIndex: 0, type: "action" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(doc);
  });

  it("sceneId 找不到 → 拒絕", () => {
    const doc = makeDoc(sceneWith([block.action("x")]));
    const r = setBlockType(doc, { sceneId: "sc_nope", blockIndex: 0, type: "dialogue" });
    expect(r.ok).toBe(false);
  });

  it("blockIndex 超出範圍 → 拒絕", () => {
    const s = sceneWith([block.action("x")]);
    const r = setBlockType(makeDoc(s), {
      sceneId: s.attrs.sceneId as string,
      blockIndex: 5,
      type: "dialogue",
    });
    expect(r.ok).toBe(false);
  });

  it("未知型別 → 拒絕", () => {
    const s = sceneWith([block.action("x")]);
    const r = setBlockType(makeDoc(s), {
      sceneId: s.attrs.sceneId as string,
      blockIndex: 0,
      // @ts-expect-error 故意傳非法型別
      type: "heading",
    });
    expect(r.ok).toBe(false);
  });
});
