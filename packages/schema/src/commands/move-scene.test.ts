import { describe, expect, it } from "vitest";

import {
  block,
  fragmentOf,
  groupWith,
  makeDoc,
  makeScene,
  memberWith,
  sceneWith,
  subsceneWith,
} from "../testing";
import { topLevelScenes } from "./identity";
import { moveGroup, moveScene } from "./move-scene";

const idOf = (n: { attrs: Record<string, unknown> }) => n.attrs.sceneId as string;

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

describe("moveScene 跨層（票券 13、§7.5）", () => {
  const unwrap = (r: ReturnType<typeof moveScene>) => {
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };

  it("升級：子場次拖到主場次之間 → 變成頂層場次，sceneId 不變、種類拿掉", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續", time: "夜" });
    const host = sceneWith([block.action("客廳"), sub, block.action("回來")]);
    const next = makeScene();
    const doc = makeDoc(host, next);

    const out = unwrap(moveScene(doc, { sceneId: idOf(sub), target: { position: "after", refSceneId: idOf(host) } }));

    expect(idsOf(out)).toEqual([idOf(host), idOf(sub), idOf(next)]);
    const promoted = out.child(1);
    expect(promoted.type.name).toBe("scene");
    expect(promoted.attrs.time).toBe("夜");
    expect(promoted.attrs).not.toHaveProperty("kind");
    expect(promoted.textContent).toBe("陽台");
    expect(out.child(0).childCount).toBe(2); // 主場次只剩自己的兩個區塊
  });

  it("降級：主場次拖進另一場內部 → 變成子場次，sceneId 與 metadata 不變、種類是放下時選的", () => {
    const host = sceneWith([block.action("客廳"), block.action("回來")]);
    const dropped = sceneWith([block.action("陽台")], { time: "夜" });
    const doc = makeDoc(host, dropped);

    const out = unwrap(
      moveScene(doc, {
        sceneId: idOf(dropped),
        target: { position: "inside", sceneId: idOf(host), index: 1 },
        kind: "插入",
      }),
    );

    expect(idsOf(out)).toEqual([idOf(host)]);
    const sub = out.child(0).child(1);
    expect(sub.type.name).toBe("subscene");
    expect(idOf(sub)).toBe(idOf(dropped));
    expect(sub.attrs.kind).toBe("插入");
    expect(sub.attrs.time).toBe("夜");
    expect(out.child(0).child(2).textContent).toBe("回來");
  });

  it("非法目標：帶著子場次的主場次拖進另一場 → 拒絕（會生出第三層，不變式 ⑤）", () => {
    const host = sceneWith([block.action("客廳")]);
    const parent = sceneWith([
      block.action("陽台"),
      subsceneWith([block.action("回憶")], { kind: "插入" }),
    ]);
    const r = moveScene(makeDoc(host, parent), {
      sceneId: idOf(parent),
      target: { position: "inside", sceneId: idOf(host), index: 1 },
      kind: "插入",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("第三層");
  });

  it("非法目標：放進子場次的內容裡 → 拒絕（子場次裝不下子場次）", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續" });
    const host = sceneWith([block.action("客廳"), sub]);
    const dropped = makeScene();
    const r = moveScene(makeDoc(host, dropped), {
      sceneId: idOf(dropped),
      target: { position: "inside", sceneId: idOf(sub), index: 1 },
      kind: "插入",
    });
    expect(r.ok).toBe(false);
  });

  it("降級沒給種類 → 拒絕（系統不代填）", () => {
    const host = sceneWith([block.action("客廳")]);
    const dropped = makeScene();
    const r = moveScene(makeDoc(host, dropped), {
      sceneId: idOf(dropped),
      target: { position: "inside", sceneId: idOf(host), index: 1 },
    });
    expect(r.ok).toBe(false);
  });

  it("非法目標：放在主場次自己的內容之前 → 拒絕（不變式 ①）", () => {
    const host = sceneWith([block.action(""), block.action("客廳")]);
    const dropped = makeScene();
    for (const index of [0, 1]) {
      const r = moveScene(makeDoc(host, dropped), {
        sceneId: idOf(dropped),
        target: { position: "inside", sceneId: idOf(host), index },
        kind: "接續",
      });
      expect(r.ok).toBe(false);
    }
  });

  it("同一段內容裡搬子場次：index 以搬移前計，種類保留", () => {
    const a = subsceneWith([block.action("甲")], { kind: "插入" });
    const b = subsceneWith([block.action("乙")], { kind: "接續" });
    const host = sceneWith([block.action("客廳"), a, block.action("中間"), b]);
    const out = unwrap(
      moveScene(makeDoc(host), {
        sceneId: idOf(a),
        target: { position: "inside", sceneId: idOf(host), index: 3 },
      }),
    );
    const kids = out.child(0);
    expect([0, 1, 2, 3].map((i) => kids.child(i).textContent)).toEqual(["客廳", "中間", "甲", "乙"]);
    expect(kids.child(2).attrs.kind).toBe("插入");
  });

  it("子場次搬進群組成員的片段（以 fragmentIndex 定址）", () => {
    const sub = subsceneWith([block.action("回憶")], { kind: "插入" });
    const scene = sceneWith([block.action("客廳"), sub]);
    const m1 = memberWith();
    const m2 = memberWith();
    const group = groupWith([m1, m2], [fragmentOf(m1, [block.action("一")]), fragmentOf(m2, [block.action("二")])]);
    const out = unwrap(
      moveScene(makeDoc(scene, group), {
        sceneId: idOf(sub),
        target: { position: "inside", sceneId: idOf(m2), fragmentIndex: 1, index: 1 },
      }),
    );
    const fragment = out.child(1).child(3);
    expect(fragment.child(1).type.name).toBe("subscene");
    expect(idOf(fragment.child(1))).toBe(idOf(sub));
    expect(out.child(0).childCount).toBe(1);
  });
});

describe("moveGroup：群組在頂層整體搬移", () => {
  const build = () => {
    const a = makeScene();
    const m1 = memberWith();
    const m2 = memberWith();
    const group = groupWith([m1, m2], [fragmentOf(m1, [block.action("一")]), fragmentOf(m2, [block.action("二")])]);
    const b = makeScene();
    return { a, b, group, doc: makeDoc(a, group, b), groupId: group.attrs.groupId as string };
  };

  it("整組搬到某場之後：成員、片段與 id 原封不動", () => {
    const { a, b, group, doc, groupId } = build();
    const r = moveGroup(doc, { groupId, target: { position: "after", refSceneId: idOf(b) } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idOf(r.value.child(0))).toBe(idOf(a));
    expect(idOf(r.value.child(1))).toBe(idOf(b));
    expect(r.value.child(2).eq(group)).toBe(true);
  });

  it("場次可以以群組為參考搬到它之前", () => {
    const { b, doc, groupId } = build();
    const r = moveScene(doc, { sceneId: idOf(b), target: { position: "before", refGroupId: groupId } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idOf(r.value.child(1))).toBe(idOf(b));
  });

  it("非法：找不到群組、以自己為參考、群組成員單獨搬 → 拒絕", () => {
    const { doc, groupId, group } = build();
    expect(moveGroup(doc, { groupId: "gr_ghost", target: { position: "start" } }).ok).toBe(false);
    expect(moveGroup(doc, { groupId, target: { position: "after", refGroupId: groupId } }).ok).toBe(false);
    const member = idOf(group.child(0));
    expect(moveScene(doc, { sceneId: member, target: { position: "start" } }).ok).toBe(false);
  });
});
