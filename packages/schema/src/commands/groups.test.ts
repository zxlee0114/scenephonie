import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { isSceneId } from "../ids";
import { projectScenes } from "../project-scenes";
import { schema } from "../schema";
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
import { duplicateSceneIds } from "./identity";
import {
  assignFragmentToMember,
  canIntercut,
  intercutTo,
  mergeAdjacentFragments,
  normalizeFragmentsPlugin,
} from "./groups";
import { deleteScene } from "./subscenes";
import { dedupeIdsPlugin, dedupeSceneIds } from "./dedupe";
import { createNextScene } from "./create-next-scene";
import { createSubscene } from "./subscenes";
import { setBlockType } from "./set-block-type";

const id = (n: { attrs: Record<string, unknown> }) => n.attrs.sceneId as string;
/** 群組的形狀：成員 id 清單、片段（歸屬 → 內文）清單。 */
function shape(group: ReturnType<typeof makeDoc>) {
  const members: string[] = [];
  const fragments: [string, string][] = [];
  group.forEach((c) => {
    if (c.type.name === "groupMember") members.push(id(c));
    else fragments.push([c.attrs.memberId as string, c.textContent]);
  });
  return { members, fragments };
}

describe("intercutTo（/ →「對剪到…」）", () => {
  it("建立新的一場：目前場次就地變成成員 1、已寫的內容變成片段 1；新成員鑄新 id、metadata 全空", () => {
    const before = makeScene({}, "前一場");
    const here = sceneWith([block.action("若晴推出照片。")], { time: "夜", intExt: "內景" });
    const r = intercutTo(makeDoc(before, here), { sceneId: id(here), withSceneId: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const group = r.value.child(1);
    expect(group.type.name).toBe("sceneGroup");
    expect(group.attrs.groupId).toMatch(/^gr_/);
    const { members, fragments } = shape(group);
    expect(members[0]).toBe(id(here));
    expect(isSceneId(members[1])).toBe(true);
    expect(members[1]).not.toBe(id(here));
    expect(fragments).toEqual([
      [id(here), "若晴推出照片。"],
      [members[1], ""],
    ]);
    // 成員 1 帶著原本的 metadata；新成員不繼承（§4.5「同時發生」不是交叉場次的定義）。
    expect(group.child(0).attrs.time).toBe("夜");
    expect(group.child(1).attrs.time).toBe(null);
    expect(projectScenes(r.value).map((s) => s.label)).toEqual(["1", "2", "3"]);
  });

  it("選既有場次：那一場被收編成成員 2（保住 sceneId 與 metadata），它的內容（含子場次）變成片段", () => {
    const here = sceneWith([block.action("偵訊室")]);
    const middle = makeScene({}, "中間");
    const sub = subsceneWith([block.action("閃回")], { kind: "插入" });
    const there = sceneWith([block.action("倉庫"), sub], { time: "夜", intExt: "外景" });
    const r = intercutTo(makeDoc(here, middle, there), { sceneId: id(here), withSceneId: id(there) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.childCount).toBe(2); // 群組 ＋ 中間那場；倉庫離開了頂層
    const group = r.value.child(0);
    expect(shape(group)).toEqual({
      members: [id(here), id(there)],
      fragments: [
        [id(here), "偵訊室"],
        [id(there), "倉庫閃回"],
      ],
    });
    expect(group.child(1).attrs.intExt).toBe("外景");
    expect(duplicateSceneIds(r.value)).toEqual([]);
    expect(projectScenes(r.value).map((s) => s.label)).toEqual(["1", "2", "2.1", "3"]);
  });

  it("在群組裡按：加入第三個成員，新片段接在游標所在片段之後", () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith([a, b], [fragmentOf(a, [block.action("A1")]), fragmentOf(b, [block.action("B1")])]);
    const r = intercutTo(makeDoc(group), { sceneId: id(a), fragmentIndex: 0, withSceneId: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { members, fragments } = shape(r.value.child(0));
    expect(members.slice(0, 2)).toEqual([id(a), id(b)]);
    expect(members).toHaveLength(3);
    expect(fragments).toEqual([
      [id(a), "A1"],
      [members[2], ""],
      [id(b), "B1"],
    ]);
    expect(r.value.child(0).attrs.groupId).toBe(group.attrs.groupId);
  });

  it("在子場次裡按，等於在它的主場次裡按", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續" });
    const here = sceneWith([block.action("客廳"), sub]);
    const r = intercutTo(makeDoc(here), { sceneId: id(sub), withSceneId: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(shape(r.value.child(0)).members[0]).toBe(id(here));
  });

  it.each([
    ["自己", (h: string) => h],
    ["不存在的場次", () => "sc_nope"],
  ])("拒絕收編%s", (_label, pick) => {
    const here = makeScene();
    expect(intercutTo(makeDoc(here), { sceneId: id(here), withSceneId: pick(id(here)) }).ok).toBe(false);
  });

  it("拒絕收編子場次與別的群組的成員 —— 一個場次不能同時屬於兩個群組（不變式 ④）", () => {
    const sub = subsceneWith([block.action("x")], { kind: "插入" });
    const withSub = sceneWith([block.action("a"), sub]);
    const a = memberWith();
    const b = memberWith();
    const other = groupWith([a, b], [fragmentOf(a, [block.action("y")])]);
    const here = makeScene();
    const doc = makeDoc(here, withSub, other);
    expect(intercutTo(doc, { sceneId: id(here), withSceneId: id(sub) }).ok).toBe(false);
    expect(intercutTo(doc, { sceneId: id(here), withSceneId: id(a) }).ok).toBe(false);
    expect(canIntercut(doc, { sceneId: id(here), withSceneId: id(a) })).toBe(false);
  });
});

describe("assignFragmentToMember（⌘+1／⌘+2／⌘+3）", () => {
  const setup = () => {
    const a = memberWith();
    const b = memberWith();
    const c = memberWith();
    const group = groupWith(
      [a, b, c],
      [fragmentOf(a, [block.action("A1"), block.action("A2"), block.action("")])],
    );
    return { a, b, c, group, groupId: group.attrs.groupId as string, doc: makeDoc(group) };
  };

  it("游標在片段第一行：整段改歸屬", () => {
    const { b, groupId, doc } = setup();
    const r = assignFragmentToMember(doc, { groupId, fragmentIndex: 0, memberId: id(b) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(shape(r.value.child(0)).fragments).toEqual([[id(b), "A1A2"]]);
  });

  it("游標在片段中間：從那一行切開，那一截（含其後）歸給成員 N", () => {
    const { a, b, groupId, doc } = setup();
    const r = assignFragmentToMember(doc, { groupId, fragmentIndex: 0, fromBlockIndex: 2, memberId: id(b) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(shape(r.value.child(0)).fragments).toEqual([
      [id(a), "A1A2"],
      [id(b), ""],
    ]);
  });

  it("切出來的那一截與後一段同一個成員時合併 —— 相鄰同成員的區別在模型裡沒有意義", () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith(
      [a, b],
      [fragmentOf(a, [block.action("A1"), block.action("A2")]), fragmentOf(b, [block.action("B1")])],
    );
    const r = assignFragmentToMember(makeDoc(group), {
      groupId: group.attrs.groupId as string,
      fragmentIndex: 0,
      fromBlockIndex: 1,
      memberId: id(b),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(shape(r.value.child(0)).fragments).toEqual([
      [id(a), "A1"],
      [id(b), "A2B1"],
    ]);
  });

  it("以 id 定址：不是這個群組的成員就拒絕 —— ⌘+4 在三成員時永遠不會憑空建立場次", () => {
    const { groupId, doc } = setup();
    expect(assignFragmentToMember(doc, { groupId, fragmentIndex: 0, memberId: "sc_nope" }).ok).toBe(false);
    expect(assignFragmentToMember(doc, { groupId: "gr_nope", fragmentIndex: 0, memberId: "sc_x" }).ok).toBe(false);
    expect(
      assignFragmentToMember(doc, { groupId, fragmentIndex: 5, memberId: "sc_x" }).ok,
    ).toBe(false);
  });

  it("切點落在子場次上就拒絕 —— 片段要以成員自己的內容開始（同不變式 ①）", () => {
    const a = memberWith();
    const b = memberWith();
    const sub = subsceneWith([block.action("x")], { kind: "插入" });
    const group = groupWith([a, b], [fragmentOf(a, [block.action("A1"), sub])]);
    const r = assignFragmentToMember(makeDoc(group), {
      groupId: group.attrs.groupId as string,
      fragmentIndex: 0,
      fromBlockIndex: 1,
      memberId: id(b),
    });
    expect(r.ok).toBe(false);
  });

  it("fragmentIndex 只是傳遞參數：結果的 doc 裡沒有任何片段 id 或位置引用", () => {
    const { b, groupId, doc } = setup();
    const r = assignFragmentToMember(doc, { groupId, fragmentIndex: 0, fromBlockIndex: 1, memberId: id(b) });
    if (!r.ok) throw new Error(r.reason);
    r.value.descendants((n) => {
      if (n.type.name === "groupFragment") expect(Object.keys(n.attrs)).toEqual(["memberId"]);
    });
    expect(JSON.stringify(r.value.toJSON())).not.toMatch(/fragmentIndex|fragmentId/);
  });
});

describe("片段正規化：相鄰同成員的片段合併", () => {
  it("純函式：把相鄰同成員的片段併成一段", () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith(
      [a, b],
      [fragmentOf(a, [block.action("1")]), fragmentOf(a, [block.action("2")]), fragmentOf(b, [block.action("3")])],
    );
    expect(shape(mergeAdjacentFragments(makeDoc(group)).child(0)).fragments).toEqual([
      [id(a), "12"],
      [id(b), "3"],
    ]);
  });

  it("appendTransaction：刪掉夾在中間的那一段之後自動合併，標 addToHistory: false", () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith(
      [a, b],
      [fragmentOf(a, [block.action("1")]), fragmentOf(b, [block.action("2")]), fragmentOf(a, [block.action("3")])],
    );
    const state = EditorState.create({ schema, doc: makeDoc(group), plugins: [normalizeFragmentsPlugin()] });
    // 找到中間那一段（b）並刪掉
    let from = -1;
    let to = -1;
    state.doc.descendants((n, pos) => {
      if (n.type.name === "groupFragment" && n.attrs.memberId === id(b)) {
        from = pos;
        to = pos + n.nodeSize;
      }
    });
    const { state: next, transactions } = state.applyTransaction(state.tr.delete(from, to));
    expect(shape(next.doc.child(0)).fragments).toEqual([[id(a), "13"]]);
    expect(transactions).toHaveLength(2);
    expect(transactions[1]!.getMeta("addToHistory")).toBe(false);
  });
});

describe("deleteScene 對群組成員", () => {
  it("刪一個成員：它的片段一起走；剩兩個以上成員時群組留著", () => {
    const [a, b, c] = [memberWith(), memberWith(), memberWith()];
    const group = groupWith(
      [a, b, c],
      [fragmentOf(a, [block.action("A")]), fragmentOf(b, [block.action("B")]), fragmentOf(c, [block.action("C")])],
    );
    const r = deleteScene(makeDoc(group), { sceneId: id(b) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(shape(r.value.child(0))).toEqual({
      members: [id(a), id(c)],
      fragments: [
        [id(a), "A"],
        [id(c), "C"],
      ],
    });
  });

  it("只剩一個成員：群組解散，那個成員變回普通場次（保住 sceneId 與 metadata），片段依序接起來", () => {
    const a = memberWith({ time: "夜" });
    const b = memberWith();
    const group = groupWith(
      [a, b],
      [fragmentOf(a, [block.action("A1")]), fragmentOf(b, [block.action("B")]), fragmentOf(a, [block.action("A2")])],
    );
    const r = deleteScene(makeDoc(group), { sceneId: id(b) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const scene = r.value.child(0);
    expect(scene.type.name).toBe("scene");
    expect(id(scene)).toBe(id(a));
    expect(scene.attrs.time).toBe("夜");
    expect(scene.textContent).toBe("A1A2");
  });

  it("剩下的成員一段片段都沒有時，給它一個空的動作區塊", () => {
    const [a, b, c] = [memberWith(), memberWith(), memberWith()];
    const group = groupWith([a, b, c], [fragmentOf(a, [block.action("A")])]);
    const r = deleteScene(makeDoc(group), { sceneId: id(a) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { fragments } = shape(r.value.child(0));
    expect(fragments).toEqual([[id(b), ""]]);
  });
});

describe("群組裡的既有 command", () => {
  const twoMembers = () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith([a, b], [fragmentOf(a, [block.action("A")]), fragmentOf(b, [block.action("B")])]);
    return { a, b, doc: makeDoc(makeScene(), group, makeScene()) };
  };

  it("/next 在群組裡：結束群組、接在整個群組之後，不是新增成員", () => {
    const { b, doc } = twoMembers();
    const r = createNextScene(doc, { afterSceneId: id(b) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.child(2).type.name).toBe("scene");
    expect(shape(r.value.child(1)).members).toHaveLength(2);
  });

  it("Tab：以成員 id ＋ fragmentIndex 定址片段裡的區塊", () => {
    const { b, doc } = twoMembers();
    const r = setBlockType(doc, { sceneId: id(b), fragmentIndex: 1, blockIndex: 0, type: "dialogue" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.child(1).child(3).child(0).type.name).toBe("dialogue");
    // 片段不屬於這個成員就拒絕
    expect(setBlockType(doc, { sceneId: id(b), fragmentIndex: 0, blockIndex: 0, type: "dialogue" }).ok).toBe(false);
  });

  it("成員可以有自己的子場次（階層裝得進平行裡面）", () => {
    const { b, doc } = twoMembers();
    const r = createSubscene(doc, { sceneId: id(b), fragmentIndex: 1, afterBlockIndex: 0, kind: "插入" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(projectScenes(r.value).map((s) => s.label)).toEqual(["1", "2", "3", "3.1", "4"]);
  });
});

describe("groupId 與 sceneId 走同一套去重", () => {
  it("純函式：複製出來的群組換新 groupId 與成員 id，片段跟著新成員走", () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith([a, b], [fragmentOf(a, [block.action("A")]), fragmentOf(b, [block.action("B")])]);
    const r = dedupeSceneIds(makeDoc(group, group));
    expect(r.changed).toBe(true);
    const [g1, g2] = [r.doc.child(0), r.doc.child(1)];
    expect(g1.attrs.groupId).toBe(group.attrs.groupId);
    expect(g2.attrs.groupId).not.toBe(group.attrs.groupId);
    expect(g2.attrs.groupId).toMatch(/^gr_/);
    expect(duplicateSceneIds(r.doc)).toEqual([]);
    const s2 = shape(g2);
    expect(s2.fragments.map(([m]) => m)).toEqual(s2.members);
  });

  it("appendTransaction：貼上一份群組副本 → 新插入的那份換新 groupId，標 addToHistory: false", () => {
    const a = memberWith();
    const b = memberWith();
    const group = groupWith([a, b], [fragmentOf(a, [block.action("A")]), fragmentOf(b, [block.action("B")])]);
    const state = EditorState.create({ schema, doc: makeDoc(group), plugins: [dedupeIdsPlugin()] });
    const { state: next, transactions } = state.applyTransaction(
      state.tr.insert(state.doc.content.size, group),
    );
    expect(next.doc.child(0).attrs.groupId).toBe(group.attrs.groupId);
    expect(next.doc.child(1).attrs.groupId).not.toBe(group.attrs.groupId);
    expect(duplicateSceneIds(next.doc)).toEqual([]);
    const s2 = shape(next.doc.child(1));
    expect(s2.fragments.map(([m]) => m)).toEqual(s2.members);
    expect(transactions[1]!.getMeta("addToHistory")).toBe(false);
  });
});
