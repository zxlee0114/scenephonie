import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { isSceneId } from "../ids";
import { schema } from "../schema";
import { makeDoc, makeScene } from "../testing";
import { dedupeIdsPlugin, dedupeIdsPluginKey, dedupeSceneIds } from "./dedupe";
import { duplicateSceneIds, sceneIdNodes } from "./identity";

const sceneCopy = (sceneId: string, text = "副本") =>
  schema.node("scene", { sceneId }, schema.node("action", null, [schema.text(text)]));

const idsOf = (doc: ReturnType<typeof makeDoc>) =>
  sceneIdNodes(doc).map((e) => e.node.attrs.sceneId as string);

describe("dedupeSceneIds（純函式，不變式 ⑥）", () => {
  it("沒有重複 → changed: false，doc 原封回傳", () => {
    const doc = makeDoc(makeScene(), makeScene());
    const r = dedupeSceneIds(doc);
    expect(r.changed).toBe(false);
    expect(r.doc).toBe(doc);
    expect(r.remints).toEqual([]);
  });

  it("是純函式：不改動輸入 doc", () => {
    const a = makeScene();
    const doc = makeDoc(a, sceneCopy(a.attrs.sceneId as string));
    const before = doc.toJSON();
    dedupeSceneIds(doc);
    expect(doc.toJSON()).toEqual(before);
  });

  it("後備規則（無 insertedRanges）：文件順序在前者保留、在後者換新 id", () => {
    const a = makeScene();
    const dupId = a.attrs.sceneId as string;
    const doc = makeDoc(a, sceneCopy(dupId));
    const r = dedupeSceneIds(doc);

    expect(r.changed).toBe(true);
    expect(duplicateSceneIds(r.doc)).toEqual([]);
    const [id0, id1] = idsOf(r.doc);
    expect(id0).toBe(dupId); // 前者保留
    expect(id1).not.toBe(dupId);
    expect(isSceneId(id1!)).toBe(true);
    expect(r.remints).toEqual([{ pos: a.nodeSize, from: dupId, to: id1 }]);
  });

  it("insertedRanges 指向後者 → 改後者（與後備規則同向）", () => {
    const a = makeScene();
    const dupId = a.attrs.sceneId as string;
    const doc = makeDoc(a, sceneCopy(dupId));
    const r = dedupeSceneIds(doc, { insertedRanges: [{ from: a.nodeSize, to: doc.content.size }] });

    expect(idsOf(r.doc)[0]).toBe(dupId);
    expect(idsOf(r.doc)[1]).not.toBe(dupId);
  });

  it("insertedRanges 指向前者（貼上貼在原節點之前）→ 改前者，原節點身分保住", () => {
    // doc 順序 [貼上的副本, 原節點]；副本在 0..firstSize 區間內
    const original = makeScene();
    const dupId = original.attrs.sceneId as string;
    const pasted = sceneCopy(dupId);
    const doc = makeDoc(pasted, original);
    const r = dedupeSceneIds(doc, { insertedRanges: [{ from: 0, to: pasted.nodeSize }] });

    expect(r.changed).toBe(true);
    const [id0, id1] = idsOf(r.doc);
    expect(id0).not.toBe(dupId); // 貼上的副本被改
    expect(id1).toBe(dupId); // 原節點（文件順序在後）身分保住
  });
});

describe("dedupeIdsPlugin（appendTransaction，Node 裡跑 EditorState、不需 EditorView）", () => {
  const withPlugin = (doc: ReturnType<typeof makeDoc>) =>
    EditorState.create({ schema, doc, plugins: [dedupeIdsPlugin()] });

  it("複製貼上（原節點仍在）→ 撞號 → 新插入的節點換新 id、原節點保住", () => {
    const a = makeScene();
    const b = makeScene();
    const state = withPlugin(makeDoc(a, b));

    // 在文件末尾插入一份與 a 同 id 的副本（＝複製貼上）
    const tr = state.tr.insert(state.doc.content.size, sceneCopy(a.attrs.sceneId as string));
    const { state: next, transactions } = state.applyTransaction(tr);

    const ids = idsOf(next.doc);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // 全部唯一
    expect(ids[0]).toBe(a.attrs.sceneId); // 原節點保住
    expect(ids[2]).not.toBe(a.attrs.sceneId); // 貼上的副本換新

    // 補了一筆修復 transaction，且標了 addToHistory: false
    expect(transactions.length).toBe(2);
    expect(transactions[1]!.getMeta("addToHistory")).toBe(false);
    expect(transactions[1]!.getMeta(dedupeIdsPluginKey)).toMatchObject({
      remints: [{ from: a.attrs.sceneId }],
    });
  });

  it("剪下貼上（原節點已離開）→ 不撞號 → id 天然保住、不補 transaction", () => {
    const a = makeScene();
    const b = makeScene();
    const state = withPlugin(makeDoc(a, b));

    // 刪掉 a、把帶 a.id 的節點插到末尾（＝剪下貼上，單一 transaction）
    const tr = state.tr;
    tr.delete(0, a.nodeSize);
    tr.insert(tr.doc.content.size, sceneCopy(a.attrs.sceneId as string));
    const { state: next, transactions } = state.applyTransaction(tr);

    const ids = idsOf(next.doc);
    expect(ids).toContain(a.attrs.sceneId); // id 天然保住
    expect(new Set(ids).size).toBe(ids.length);
    expect(transactions.length).toBe(1); // 沒有補修復 transaction
  });

  it("碰撞本身是唯一判別器：plugin 不看 provenance，純靠有沒有撞號", () => {
    const a = makeScene();
    const state = withPlugin(makeDoc(a, makeScene()));
    // 一筆什麼都沒插入、不撞號的 transaction
    const noop = state.tr.setNodeMarkup(0, undefined, { ...a.attrs, time: "日" });
    const { transactions } = state.applyTransaction(noop);
    expect(transactions.length).toBe(1);
  });
});
