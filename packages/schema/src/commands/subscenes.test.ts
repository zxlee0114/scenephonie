/**
 * 子場次（票券 11、ADR-0003／0006、§4.4）—— kernel 那一半。
 *
 * 手勢（`/insert`、`/continue-to`、`/back-to`、雙 Enter）住在編輯器；這裡測的是意圖：
 * 建立帶 `kind` 的子場次、不變式 ①（空場次不可建立）、明確套用、連帶刪除。
 */
import { Node } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { mintLocationId, mintCharacterId, entityDirectory } from "../entities";
import { mintExtraId } from "../extras";
import { schema } from "../schema";
import { block, makeDoc, sceneWith, subsceneWith } from "../testing";
import { sceneIdNodes } from "./identity";
import {
  canCreateSubscene,
  createSubscene,
  deleteScene,
  subsceneCount,
} from "./subscenes";
import { setBlockType } from "./set-block-type";
import { setSceneLocations, setSceneIntExt, retitleEntityRefs } from "./entity-refs";
import { setSceneExtras } from "./extras";
import { createNextScene } from "./create-next-scene";

const idOf = (n: Node) => n.attrs.sceneId as string;
const ok = <T>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

const loc = { locationId: mintLocationId(), displayName: "公寓客廳" };

describe("schema：subscene 節點", () => {
  it("主場次的內容可以是區塊與子場次交錯", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續" });
    const scene = sceneWith([block.action("客廳"), sub, block.action("回來")]);
    expect(() => makeDoc(scene).check()).not.toThrow();
  });

  it("不變式 ⑤：子場次的內容規則不含子場次（schema 直接保證，不是執行期檢查）", () => {
    const inner = subsceneWith([block.action("x")], { kind: "插入" });
    expect(schema.nodes.subscene.contentMatch.matchType(schema.nodes.subscene)).toBeNull();
    expect(() =>
      schema.node("subscene", { sceneId: "sc_x", kind: "插入" }, [block.action("a"), inner]),
    ).toThrow();
  });

  it("子場次不能出現在文件頂層", () => {
    expect(schema.nodes.doc.contentMatch.matchType(schema.nodes.subscene)).toBeNull();
  });

  it("kind 不允許 null、無預設：載入時少了或寫壞都會被攔", () => {
    const base = { type: "subscene", attrs: { sceneId: "sc_s" }, content: [{ type: "action" }] };
    const wrap = (sub: unknown) => ({
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: "sc_p" }, content: [{ type: "action", content: [{ type: "text", text: "a" }] }, sub] }],
    });
    expect(() => Node.fromJSON(schema, wrap(base))).toThrow();
    expect(() => Node.fromJSON(schema, wrap({ ...base, attrs: { sceneId: "sc_s", kind: null } }))).toThrow();
    expect(() => Node.fromJSON(schema, wrap({ ...base, attrs: { sceneId: "sc_s", kind: "閃回" } }))).toThrow();
    const back = Node.fromJSON(schema, wrap({ ...base, attrs: { sceneId: "sc_s", kind: "接續" } }));
    expect(back.child(0).child(1).attrs.kind).toBe("接續");
  });

  it("metadata attr 與 scene 同一組（外加 kind），可為 null 的一律 default null", () => {
    const sceneAttrs = Object.keys(schema.nodes.scene.spec.attrs ?? {});
    const subAttrs = Object.keys(schema.nodes.subscene.spec.attrs ?? {});
    expect(subAttrs.sort()).toEqual([...sceneAttrs, "kind"].sort());
    for (const name of ["time", "intExt", "location", "appearingCharacters"]) {
      expect(schema.nodes.subscene.spec.attrs![name]!.default).toBeNull();
    }
  });
});

describe("createSubscene", () => {
  const parentWith = (...children: Node[]) => sceneWith(children, { location: loc, time: "夜", intExt: "內景" });

  it("在主場次的區塊之後建立一個帶 kind 的子場次，鑄一個新身分", () => {
    const parent = parentWith(block.action("客廳"), block.action("之後"));
    const doc = ok(createSubscene(makeDoc(parent), { sceneId: idOf(parent), afterBlockIndex: 0, kind: "接續" }));
    const scene = doc.child(0);
    expect(scene.childCount).toBe(3);
    const sub = scene.child(1);
    expect(sub.type.name).toBe("subscene");
    expect(sub.attrs.kind).toBe("接續");
    expect(idOf(sub)).toMatch(/^sc_/);
    expect(idOf(sub)).not.toBe(idOf(parent));
    expect(scene.child(2).textContent).toBe("之後");
  });

  it("metadata 完全不繼承主場次 —— 全部空著（→ 草稿防呆照常）", () => {
    const parent = parentWith(block.action("客廳"));
    const doc = ok(createSubscene(makeDoc(parent), { sceneId: idOf(parent), afterBlockIndex: 0, kind: "插入" }));
    const sub = doc.child(0).child(1);
    expect(sub.attrs.time).toBeNull();
    expect(sub.attrs.intExt).toBeNull();
    expect(sub.attrs.location).toBeNull();
    expect(sub.attrs.appearingCharacters).toBeNull();
  });

  it("新子場次的內容是一個空動作區塊", () => {
    const parent = parentWith(block.action("客廳"));
    const doc = ok(createSubscene(makeDoc(parent), { sceneId: idOf(parent), afterBlockIndex: 0, kind: "插入" }));
    const sub = doc.child(0).child(1);
    expect(sub.childCount).toBe(1);
    expect(sub.child(0).type.name).toBe("action");
    expect(sub.child(0).content.size).toBe(0);
  });

  it("kind 必填 —— 系統不代填", () => {
    const parent = parentWith(block.action("客廳"));
    const r = createSubscene(makeDoc(parent), {
      sceneId: idOf(parent),
      afterBlockIndex: 0,
      kind: "閃回" as never,
    });
    expect(r.ok).toBe(false);
  });

  it("在子場次裡按下去 ＝ 在本主場次底下建立兄弟（語意不變），接在那個子場次之後", () => {
    const first = subsceneWith([block.action("陽台"), block.action("還在陽台")], { kind: "接續" });
    const parent = parentWith(block.action("客廳"), first, block.action("回來"));
    const doc = ok(createSubscene(makeDoc(parent), { sceneId: idOf(first), afterBlockIndex: 0, kind: "插入" }));
    const scene = doc.child(0);
    expect(scene.childCount).toBe(4);
    expect(idOf(scene.child(1))).toBe(idOf(first));
    expect(scene.child(1).childCount).toBe(2); // 不切開原本的子場次
    expect(scene.child(2).type.name).toBe("subscene");
    expect(scene.child(2).attrs.kind).toBe("插入");
    expect(scene.child(3).textContent).toBe("回來");
  });

  describe("不變式 ①：主場次的內容必須以主場次自己的內容開始", () => {
    it("空場次裡不可用 —— command 拒絕", () => {
      const parent = sceneWith([block.action("")]);
      const r = createSubscene(makeDoc(parent), { sceneId: idOf(parent), afterBlockIndex: 0, kind: "插入" });
      expect(r.ok).toBe(false);
      expect(canCreateSubscene(makeDoc(parent), { sceneId: idOf(parent), afterBlockIndex: 0 })).toBe(false);
    });

    it("空區塊不算內容：前面只有空區塊也不可用", () => {
      const parent = sceneWith([block.action(""), block.dialogue(""), block.action("後面才有字")]);
      const doc = makeDoc(parent);
      expect(canCreateSubscene(doc, { sceneId: idOf(parent), afterBlockIndex: 1 })).toBe(false);
      expect(canCreateSubscene(doc, { sceneId: idOf(parent), afterBlockIndex: 2 })).toBe(true);
    });

    it("插入點之前有主場次自己的內容才可用（afterBlockIndex = -1 就是當第一個孩子）", () => {
      const parent = sceneWith([block.action("客廳")]);
      const doc = makeDoc(parent);
      expect(canCreateSubscene(doc, { sceneId: idOf(parent), afterBlockIndex: 0 })).toBe(true);
      expect(canCreateSubscene(doc, { sceneId: idOf(parent), afterBlockIndex: -1 })).toBe(false);
      expect(createSubscene(doc, { sceneId: idOf(parent), afterBlockIndex: -1, kind: "插入" }).ok).toBe(false);
    });

    it("在子場次裡永遠可用（主場次的內容早就開始了）", () => {
      const sub = subsceneWith([block.action("")], { kind: "接續" });
      const parent = sceneWith([block.action("客廳"), sub]);
      expect(canCreateSubscene(makeDoc(parent), { sceneId: idOf(sub), afterBlockIndex: 0 })).toBe(true);
    });
  });

  describe("明確套用：複製既有場次的內外／時間／地點", () => {
    it("套用三欄、不套用登場人物與群演", () => {
      const chars = [{ characterId: mintCharacterId(), displayName: "小明" }];
      const source = sceneWith([block.action("醫院")], {
        time: "日",
        intExt: "外景",
        location: { locationId: mintLocationId(), displayName: "醫院走廊" },
        appearingCharacters: chars,
        extras: [{ extraId: mintExtraId(), description: "護士", countValue: { kind: "exact", count: 2 } }],
      });
      const parent = parentWith(block.action("客廳"));
      const doc = ok(
        createSubscene(makeDoc(parent, source), {
          sceneId: idOf(parent),
          afterBlockIndex: 0,
          kind: "插入",
          applyFromSceneId: idOf(source),
        }),
      );
      const sub = doc.child(0).child(1);
      expect(sub.attrs.time).toBe("日");
      expect(sub.attrs.intExt).toBe("外景");
      expect(sub.attrs.location).toEqual(source.attrs.location);
      expect(sub.attrs.appearingCharacters).toBeNull();
      expect(sub.attrs.extras).toEqual([]);
    });

    it("套用是複製不是連動：之後改來源場次，子場次不跟著變", () => {
      const parent = parentWith(block.action("客廳"));
      let doc = ok(
        createSubscene(makeDoc(parent), {
          sceneId: idOf(parent),
          afterBlockIndex: 0,
          kind: "接續",
          applyFromSceneId: idOf(parent),
        }),
      );
      doc = ok(setSceneIntExt(doc, { sceneId: idOf(parent), intExt: "外景" }));
      expect(doc.child(0).child(1).attrs.intExt).toBe("內景");
      expect(doc.child(0).child(1).attrs.location).not.toBe(doc.child(0).attrs.location);
    });

    it("可以套用另一個子場次", () => {
      const other = subsceneWith([block.action("夢")], { kind: "插入", time: "晨" });
      const parent = parentWith(block.action("客廳"), other);
      const doc = ok(
        createSubscene(makeDoc(parent), {
          sceneId: idOf(parent),
          afterBlockIndex: 0,
          kind: "插入",
          applyFromSceneId: idOf(other),
        }),
      );
      expect(doc.child(0).child(1).attrs.time).toBe("晨");
    });

    it("來源場次不存在就拒絕", () => {
      const parent = parentWith(block.action("客廳"));
      const r = createSubscene(makeDoc(parent), {
        sceneId: idOf(parent),
        afterBlockIndex: 0,
        kind: "插入",
        applyFromSceneId: "sc_missing",
      });
      expect(r.ok).toBe(false);
    });
  });

  it("找不到場次就拒絕", () => {
    expect(createSubscene(makeDoc(), { sceneId: "sc_nope", afterBlockIndex: 0, kind: "插入" }).ok).toBe(false);
  });
});

describe("deleteScene", () => {
  it("刪除主場次一併刪除子場次（子樹是一個節點）", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續" });
    const parent = sceneWith([block.action("客廳"), sub]);
    const keep = sceneWith([block.action("下一場")]);
    const doc = ok(deleteScene(makeDoc(parent, keep), { sceneId: idOf(parent) }));
    expect(doc.childCount).toBe(1);
    expect(sceneIdNodes(doc).map((e) => idOf(e.node))).toEqual([idOf(keep)]);
  });

  it("刪除子場次只刪它自己，主場次其餘內容原封不動", () => {
    const sub = subsceneWith([block.action("陽台")], { kind: "接續" });
    const parent = sceneWith([block.action("客廳"), sub, block.action("回來")]);
    const doc = ok(deleteScene(makeDoc(parent), { sceneId: idOf(sub) }));
    expect(doc.child(0).childCount).toBe(2);
    expect(idOf(doc.child(0))).toBe(idOf(parent));
    expect(doc.child(0).textContent).toBe("客廳回來");
  });

  it("刪掉最後一場也合法（空劇本是一個合法狀態，票券 32）", () => {
    const only = sceneWith([block.action("x")]);
    expect(ok(deleteScene(makeDoc(only), { sceneId: idOf(only) })).childCount).toBe(0);
  });

  it("找不到場次就拒絕", () => {
    expect(deleteScene(makeDoc(), { sceneId: "sc_nope" }).ok).toBe(false);
  });

  it("subsceneCount 數主場次底下的子場次（選單標籤用）", () => {
    const parent = sceneWith([
      block.action("a"),
      subsceneWith([block.action("b")], { kind: "插入" }),
      block.action("c"),
      subsceneWith([block.action("d")], { kind: "接續" }),
    ]);
    expect(subsceneCount(parent)).toBe(2);
    expect(subsceneCount(sceneWith([block.action("a")]))).toBe(0);
  });
});

describe("既有 command 也定址得到子場次（以 sceneId，不以位置）", () => {
  const directory = entityDirectory({ locationIds: [loc.locationId] });
  const sub = () => subsceneWith([block.action("陽台")], { kind: "接續" });

  it("setSceneLocations 寫進子場次，不動主場次", () => {
    const s = sub();
    const parent = sceneWith([block.action("客廳"), s]);
    const doc = ok(setSceneLocations(makeDoc(parent), { sceneId: idOf(s), refs: [loc], directory }));
    expect(doc.child(0).child(1).attrs.location).toEqual(loc);
    expect(doc.child(0).attrs.location).toBeNull();
  });

  it("setBlockType 以子場次 id ＋ 子場次內的區塊序定址", () => {
    const s = sub();
    const parent = sceneWith([block.action("客廳"), s]);
    const doc = ok(setBlockType(makeDoc(parent), { sceneId: idOf(s), blockIndex: 0, type: "dialogue" }));
    expect(doc.child(0).child(1).child(0).type.name).toBe("dialogue");
  });

  it("setBlockType 不會把主場次裡的子場次當成區塊改型別", () => {
    const s = sub();
    const parent = sceneWith([block.action("客廳"), s]);
    expect(setBlockType(makeDoc(parent), { sceneId: idOf(parent), blockIndex: 1, type: "dialogue" }).ok).toBe(false);
  });

  it("setSceneExtras 寫進子場次", () => {
    const s = sub();
    const parent = sceneWith([block.action("客廳"), s]);
    const extras = [{ extraId: mintExtraId(), description: "路人", countValue: { kind: "exact" as const, count: 3 } }];
    const doc = ok(setSceneExtras(makeDoc(parent), { sceneId: idOf(s), extras }));
    expect(doc.child(0).child(1).attrs.extras).toEqual(extras);
  });

  it("retitleEntityRefs 也改到子場次裡的引用", () => {
    const s = subsceneWith([block.action("陽台")], { kind: "接續", location: loc });
    const parent = sceneWith([block.action("客廳"), s]);
    const doc = ok(retitleEntityRefs(makeDoc(parent), { entityId: loc.locationId, from: "公寓客廳", to: "海豚公寓" }));
    expect(doc.child(0).child(1).attrs.location).toEqual({ ...loc, displayName: "海豚公寓" });
  });

  it("createNextScene 從子場次按下去 ＝ 接在它的主場次之後", () => {
    const s = sub();
    const parent = sceneWith([block.action("客廳"), s]);
    const after = sceneWith([block.action("後面")]);
    const doc = ok(createNextScene(makeDoc(parent, after), { afterSceneId: idOf(s) }));
    expect(doc.childCount).toBe(3);
    expect(idOf(doc.child(0))).toBe(idOf(parent));
    expect(idOf(doc.child(2))).toBe(idOf(after));
  });
});
