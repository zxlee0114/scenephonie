/**
 * 對白帶著群演離開原場次（票券 13，使用者驗收 2026-10-22）。對白的人物欄可以指「本場的群演」
 * （§5.1），群演是場次限定實體 —— 區塊搬到別場時，定義要跟著補進新的那一場，不然那顆 chip
 * 指不到任何東西。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { mintExtraId } from "../extras";
import { sceneExtras } from "../extras";
import { block, fragmentOf, groupWith, makeDoc, memberWith, sceneWith } from "../testing";
import { adoptStrayExtras } from "./extra-adoption";
import { moveBlock } from "./move-block";

const idOf = (n: ProseMirrorNode) => n.attrs.sceneId as string;
const waiters = (extraId: string) => ({ extraId, description: "服務生", countValue: { kind: "exact", count: 2 } });

describe("moveBlock：搬走的對白說話者是群演 → 那筆群演跟著補進新的那一場", () => {
  it("複製原場次那一筆（同一個 extraId、描述與人數照舊）；原場次的那一筆留著", () => {
    const extraId = mintExtraId();
    const a = sceneWith([block.action("咖啡廳"), block.dialogue("歡迎光臨", { character: { id: extraId, displayName: "服務生" } })], {
      extras: [waiters(extraId)],
    });
    const b = sceneWith([block.action("街上")]);
    const r = moveBlock(makeDoc(a, b), { from: { sceneId: idOf(a), blockIndex: 1 }, to: { sceneId: idOf(b), index: 1 } });
    if (!r.ok) throw new Error(r.reason);
    expect(sceneExtras(r.value.child(1).attrs.extras)).toEqual([waiters(extraId)]);
    expect(sceneExtras(r.value.child(0).attrs.extras)).toEqual([waiters(extraId)]);
  });

  it("新的那場已經有這一筆：不重複加", () => {
    const extraId = mintExtraId();
    const a = sceneWith([block.action("咖啡廳"), block.dialogue("歡迎", { character: { id: extraId, displayName: "服務生" } })], {
      extras: [waiters(extraId)],
    });
    const b = sceneWith([block.action("街上")], { extras: [waiters(extraId)] });
    const r = moveBlock(makeDoc(a, b), { from: { sceneId: idOf(a), blockIndex: 1 }, to: { sceneId: idOf(b), index: 1 } });
    if (!r.ok) throw new Error(r.reason);
    expect(sceneExtras(r.value.child(1).attrs.extras)).toHaveLength(1);
  });
});

describe("adoptStrayExtras（貼上、拖放之後的修復）", () => {
  it("哪裡都找不到那筆群演（從別份劇本貼來）：以顯示名補一筆，人數「若干」", () => {
    const extraId = mintExtraId();
    const b = sceneWith([block.dialogue("借過", { character: { id: extraId, displayName: "路人" } })]);
    const out = adoptStrayExtras(makeDoc(b));
    expect(sceneExtras(out.child(0).attrs.extras)).toEqual([{ extraId, description: "路人", countValue: { kind: "some" } }]);
  });

  it("片段裡的對白：補進它所屬的那個成員", () => {
    const extraId = mintExtraId();
    const source = sceneWith([block.action("咖啡廳")], { extras: [waiters(extraId)] });
    const m1 = memberWith();
    const m2 = memberWith();
    const group = groupWith([m1, m2], [fragmentOf(m1, [block.dialogue("歡迎", { character: { id: extraId, displayName: "服務生" } })]), fragmentOf(m2, [block.action("乙")])]);
    const out = adoptStrayExtras(makeDoc(source, group));
    const member = out.child(1).child(0);
    expect(sceneExtras(member.attrs.extras)).toEqual([waiters(extraId)]);
  });

  it("沒有懸空的群演引用：原封不動（同一個物件）", () => {
    const doc = makeDoc(sceneWith([block.dialogue("嗨", { character: { id: "ch_x", displayName: "小明" } })]));
    expect(adoptStrayExtras(doc)).toBe(doc);
  });
});
