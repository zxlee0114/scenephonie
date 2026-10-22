/**
 * `moveBlock` —— 區塊跨場次、跨層搬移（票券 13、§7.5）。拖曳的手勢住在編輯器；這裡測意圖。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { block, makeDoc, sceneWith, subsceneWith } from "../testing";
import { moveBlock, movedBlockLocation } from "./move-block";

const idOf = (n: ProseMirrorNode) => n.attrs.sceneId as string;
const texts = (n: ProseMirrorNode) => {
  const out: string[] = [];
  n.forEach((c) => out.push(c.type.name === "subscene" ? `[${c.textContent}]` : c.textContent));
  return out;
};
const unwrap = (r: ReturnType<typeof moveBlock>) => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe("moveBlock", () => {
  it("跨層：子場次裡的區塊拖到主場次的內容裡", () => {
    const sub = subsceneWith([block.action("陽台"), block.dialogue("好冷")], { kind: "接續" });
    const host = sceneWith([block.action("客廳"), sub, block.action("回來")]);
    const out = unwrap(
      moveBlock(makeDoc(host), {
        from: { sceneId: idOf(sub), blockIndex: 1 },
        to: { sceneId: idOf(host), index: 3 },
      }),
    );
    expect(texts(out.child(0))).toEqual(["客廳", "[陽台]", "回來", "好冷"]);
    expect(out.child(0).child(3).type.name).toBe("dialogue");
  });

  it("搬走一場的最後一個區塊 → 那場補一個空的動作區塊，場次留在原地", () => {
    const a = sceneWith([block.dialogue("唯一一句")]);
    const b = sceneWith([block.action("客廳")]);
    const out = unwrap(
      moveBlock(makeDoc(a, b), { from: { sceneId: idOf(a), blockIndex: 0 }, to: { sceneId: idOf(b), index: 1 } }),
    );
    expect(idOf(out.child(0))).toBe(idOf(a));
    expect(out.child(0).childCount).toBe(1);
    expect(out.child(0).child(0).type.name).toBe("action");
    expect(out.child(0).textContent).toBe("");
    expect(texts(out.child(1))).toEqual(["客廳", "唯一一句"]);
  });

  it("階層化變體：主場次自己最後一個區塊被拖走、只剩子場次 → 最前面補空動作區塊（不變式 ①）", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續" });
    const host = sceneWith([block.action("客廳"), sub]);
    const other = sceneWith([block.action("街上")]);
    const out = unwrap(
      moveBlock(makeDoc(host, other), {
        from: { sceneId: idOf(host), blockIndex: 0 },
        to: { sceneId: idOf(other), index: 0 },
      }),
    );
    expect(texts(out.child(0))).toEqual(["", "[陽台]"]);
    expect(out.child(0).child(0).type.name).toBe("action");
    expect(texts(out.child(1))).toEqual(["客廳", "街上"]);
  });

  it("搬走子場次的最後一個區塊 → 子場次補空動作區塊", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "插入" });
    const host = sceneWith([block.action("客廳"), sub]);
    const out = unwrap(
      moveBlock(makeDoc(host), { from: { sceneId: idOf(sub), blockIndex: 0 }, to: { sceneId: idOf(host), index: 1 } }),
    );
    expect(texts(out.child(0))).toEqual(["客廳", "陽台", "[]"]);
  });

  it("同一段內容裡搬：index 以搬移前計", () => {
    const s = sceneWith([block.action("一"), block.action("二"), block.action("三")]);
    const out = unwrap(
      moveBlock(makeDoc(s), { from: { sceneId: idOf(s), blockIndex: 0 }, to: { sceneId: idOf(s), index: 2 } }),
    );
    expect(texts(out.child(0))).toEqual(["二", "一", "三"]);
  });

  it("非法：來源不是區塊（主場次裡的子場次）、落點超出範圍 → 拒絕", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "插入" });
    const host = sceneWith([block.action("客廳"), sub]);
    const doc = makeDoc(host);
    expect(moveBlock(doc, { from: { sceneId: idOf(host), blockIndex: 1 }, to: { sceneId: idOf(host), index: 0 } }).ok).toBe(false);
    expect(moveBlock(doc, { from: { sceneId: idOf(host), blockIndex: 0 }, to: { sceneId: idOf(sub), index: 5 } }).ok).toBe(false);
    expect(moveBlock(doc, { from: { sceneId: "sc_ghost", blockIndex: 0 }, to: { sceneId: idOf(host), index: 0 } }).ok).toBe(false);
  });
});

describe("movedBlockLocation —— 搬完之後，搬過去的那個區塊在哪（編輯器把游標放在那裡）", () => {
  it("同一段內容裡往後搬：以搬移後計，扣掉來源那一格", () => {
    const a = sceneWith([block.action("一"), block.action("二"), block.action("三")]);
    const options = { from: { sceneId: idOf(a), blockIndex: 0 }, to: { sceneId: idOf(a), index: 3 } };
    expect(movedBlockLocation(makeDoc(a), options)).toEqual({ sceneId: idOf(a), blockIndex: 2 });
  });

  it("同一段內容裡搬、來源得在最前面補空動作區塊：落點跟著往後一格", () => {
    const sub = subsceneWith([block.action("回憶")], { kind: "插入" });
    const a = sceneWith([block.action("客廳"), sub, block.action("回來")]);
    const doc = makeDoc(a);
    const options = { from: { sceneId: idOf(a), blockIndex: 0 }, to: { sceneId: idOf(a), index: 3 } };
    const out = unwrap(moveBlock(doc, options));
    expect(texts(out.child(0))).toEqual(["", "[回憶]", "回來", "客廳"]);
    expect(movedBlockLocation(doc, options)).toEqual({ sceneId: idOf(a), blockIndex: 3 });
  });

  it("跨場次：落在目的地那段內容的 `index`", () => {
    const a = sceneWith([block.action("一")]);
    const b = sceneWith([block.action("街上")]);
    const options = { from: { sceneId: idOf(a), blockIndex: 0 }, to: { sceneId: idOf(b), index: 1 } };
    expect(movedBlockLocation(makeDoc(a, b), options)).toEqual({ sceneId: idOf(b), blockIndex: 1 });
  });

  it("搬不動（會被拒絕）就回 `null`", () => {
    const a = sceneWith([block.action("一")]);
    const options = { from: { sceneId: idOf(a), blockIndex: 5 }, to: { sceneId: idOf(a), index: 0 } };
    expect(movedBlockLocation(makeDoc(a), options)).toBeNull();
  });
});
