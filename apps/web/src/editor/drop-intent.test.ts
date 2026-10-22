/**
 * 落點解析（票券 13、§7.5）—— 「拖的是什麼 × 滑到哪個落點的哪一半」→ 要送哪一支 command，或
 * `null`（不畫落點線）。合法性一律問 kernel：UI 不自己重寫一套規則（縱深：落點線擋滑鼠、command
 * 擋其餘）。
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import { mintGroupId, mintSceneId, schema as k } from "@scenephonie/schema";
import { describe, expect, it } from "vitest";

import { resolveDrop } from "./drop-intent";

const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const scene = (blocks: PMNode[]) => k.node("scene", { sceneId: mintSceneId() }, blocks);
const sub = (blocks: PMNode[]) => k.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, blocks);
const idOf = (n: PMNode) => n.attrs.sceneId as string;

function fixture() {
  const s1 = sub([action("回憶")]);
  const a = scene([action("客廳"), s1, action("回來")]);
  const b = scene([action("街上"), action("夜")]);
  const m1 = k.node("groupMember", { sceneId: mintSceneId() });
  const m2 = k.node("groupMember", { sceneId: mintSceneId() });
  const groupId = mintGroupId();
  const group = k.node("sceneGroup", { groupId }, [
    m1,
    m2,
    k.node("groupFragment", { memberId: idOf(m1) }, [action("一")]),
    k.node("groupFragment", { memberId: idOf(m2) }, [action("二")]),
  ]);
  return { doc: k.node("doc", null, [a, b, group]), a, b, s1, groupId, m2 };
}

describe("resolveDrop", () => {
  it("區塊滑到別場某個區塊的下半 → moveBlock 放在它之後", () => {
    const { doc, a, b } = fixture();
    const intent = resolveDrop(
      doc,
      { kind: "block", from: { sceneId: idOf(a), blockIndex: 0 } },
      { kind: "block", container: { sceneId: idOf(b) }, index: 1 },
      "after",
    );
    expect(intent).toEqual({
      command: "moveBlock",
      options: { from: { sceneId: idOf(a), blockIndex: 0 }, to: { sceneId: idOf(b), index: 2 } },
    });
  });

  it("沒有子場次的主場次滑到別場的區塊之間 → 降級（要在放下時選種類）", () => {
    const { doc, a, b } = fixture();
    const intent = resolveDrop(
      doc,
      { kind: "scene", sceneId: idOf(b) },
      { kind: "block", container: { sceneId: idOf(a) }, index: 2 },
      "after",
    );
    expect(intent).toEqual({
      command: "moveScene",
      options: { sceneId: idOf(b), target: { position: "inside", sceneId: idOf(a), index: 3 } },
      demote: true,
    });
  });

  it("帶著子場次的主場次滑到別場的區塊之間 → null（不畫落點線）", () => {
    const { doc, a, b } = fixture();
    expect(
      resolveDrop(doc, { kind: "scene", sceneId: idOf(a) }, { kind: "block", container: { sceneId: idOf(b) }, index: 0 }, "after"),
    ).toBeNull();
  });

  it("子場次放在主場次自己的內容之前 → null（不變式 ①）", () => {
    const { doc, b } = fixture();
    expect(
      resolveDrop(doc, { kind: "scene", sceneId: idOf(b) }, { kind: "block", container: { sceneId: idOf(fixture().a) }, index: 0 }, "before"),
    ).toBeNull();
  });

  it("子場次滑到主場次的外框 → 升級成頂層場次", () => {
    const { doc, s1, b } = fixture();
    expect(resolveDrop(doc, { kind: "scene", sceneId: idOf(s1) }, { kind: "scene", sceneId: idOf(b) }, "before")).toEqual({
      command: "moveScene",
      options: { sceneId: idOf(s1), target: { position: "before", refSceneId: idOf(b) } },
      demote: false,
    });
  });

  it("滑到子場次的外框 → 在主場次裡排在它之前／之後", () => {
    const { doc, a, s1 } = fixture();
    expect(
      resolveDrop(
        doc,
        { kind: "block", from: { sceneId: idOf(a), blockIndex: 2 } },
        { kind: "subscene", sceneId: idOf(s1), host: { sceneId: idOf(a) }, index: 1 },
        "before",
      ),
    ).toEqual({
      command: "moveBlock",
      options: { from: { sceneId: idOf(a), blockIndex: 2 }, to: { sceneId: idOf(a), index: 1 } },
    });
  });

  it("群組只在頂層移動：滑到場次外框 → moveGroup；滑到區塊之間 → null", () => {
    const { doc, a, b, groupId } = fixture();
    expect(resolveDrop(doc, { kind: "group", groupId }, { kind: "scene", sceneId: idOf(a) }, "after")).toEqual({
      command: "moveGroup",
      options: { groupId, target: { position: "after", refSceneId: idOf(a) } },
    });
    expect(
      resolveDrop(doc, { kind: "group", groupId }, { kind: "block", container: { sceneId: idOf(b) }, index: 0 }, "after"),
    ).toBeNull();
  });

  it("區塊不能落到頂層（場次或群組的外框）→ null", () => {
    const { doc, a, b, groupId } = fixture();
    const payload = { kind: "block", from: { sceneId: idOf(a), blockIndex: 0 } } as const;
    expect(resolveDrop(doc, payload, { kind: "scene", sceneId: idOf(b) }, "after")).toBeNull();
    expect(resolveDrop(doc, payload, { kind: "group", groupId }, "before")).toBeNull();
  });

  it("放回原地（不會改變任何東西）→ null", () => {
    const { doc, b } = fixture();
    const payload = { kind: "block", from: { sceneId: idOf(b), blockIndex: 0 } } as const;
    expect(resolveDrop(doc, payload, { kind: "block", container: { sceneId: idOf(b) }, index: 0 }, "after")).toBeNull();
    expect(resolveDrop(doc, payload, { kind: "block", container: { sceneId: idOf(b) }, index: 1 }, "before")).toBeNull();
  });

  it("片段裡的區塊以 fragmentIndex 定址", () => {
    const { doc, b, m2 } = fixture();
    expect(
      resolveDrop(
        doc,
        { kind: "block", from: { sceneId: idOf(b), blockIndex: 1 } },
        { kind: "block", container: { sceneId: idOf(m2), fragmentIndex: 1 }, index: 0 },
        "after",
      ),
    ).toEqual({
      command: "moveBlock",
      options: { from: { sceneId: idOf(b), blockIndex: 1 }, to: { sceneId: idOf(m2), fragmentIndex: 1, index: 1 } },
    });
  });
});
