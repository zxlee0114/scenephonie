import { Node } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { mintSceneId } from "./ids";
import { INT_EXT_VALUES, nullableSceneAttrNames, schema, TIME_VALUES, VOICE_VALUES } from "./schema";
import { makeDoc, makeScene } from "./testing";

function sceneAttrSpec(name: string) {
  const attrs = schema.nodes.scene.spec.attrs;
  if (!attrs || !(name in attrs)) throw new Error(`scene 沒有 attr ${name}`);
  return attrs[name]!;
}

describe("內容規則（§5.1，本票券範圍：doc / scene / sceneBlock）", () => {
  it("scene := sceneBlock+（至少一個區塊）", () => {
    expect(() => schema.node("doc", null, [makeScene()])).not.toThrow();
    expect(() => schema.node("scene", { sceneId: mintSceneId() }, [])).toThrow();
  });

  it("doc 內容放寬成 scene*（空 doc 由 schema 放行，「至少一場」是 command／編輯器初始化的責任）", () => {
    expect(() => schema.node("doc", null, [])).not.toThrow();
    expect(schema.nodes.doc.spec.content).toBe("scene*");
  });

  it("sceneBlock 涵蓋 action / dialogue / insertShot", () => {
    const blocks = [
      schema.node("action", null, [schema.text("動作")]),
      schema.node("dialogue", null, [schema.text("台詞")]),
      schema.node("insertShot", null, [schema.text("插入畫面")]),
    ];
    expect(() => schema.node("scene", { sceneId: mintSceneId() }, blocks)).not.toThrow();
  });

  it("marks 全關 —— 約束 2，資料模型不含呈現性資訊", () => {
    expect(Object.keys(schema.marks)).toEqual([]);
  });
});

describe("sceneId：建立時鑄造，無 default（§4.3、ADR-0002）", () => {
  it("建立 scene 節點沒給 sceneId 會炸", () => {
    expect(() => schema.node("scene", {}, [schema.node("action", null, [])])).toThrow();
  });

  it("Node.fromJSON 少了 sceneId 會炸", () => {
    const json = makeScene().toJSON() as { attrs: Record<string, unknown> };
    delete json.attrs.sceneId;
    expect(() => Node.fromJSON(schema, { type: "doc", content: [json] })).toThrow();
  });
});

describe("null 鐵律：可為 null 的欄位 default 也是 null（§5.3，票券 19 探針）", () => {
  it.each([...nullableSceneAttrNames])("`%s` 的 schema default 是 null", (name) => {
    expect(sceneAttrSpec(name).default).toBe(null);
  });

  it.each([...nullableSceneAttrNames])("不指定 `%s` 時，建出來的節點該欄位是 null", (name) => {
    expect(makeScene().attrs[name]).toBe(null);
  });

  it.each([...nullableSceneAttrNames])(
    "往返後 `%s` 不被 default 靜默改寫（模擬傳輸層丟掉 null attr）",
    (name) => {
      const scene = makeScene({ time: null, intExt: null, location: null, appearingCharacters: null });
      const json = scene.toJSON() as { attrs: Record<string, unknown> };
      // y-prosemirror 不儲存 null attr —— 把它從序列化結果整個拿掉，回程只剩 default 可補
      delete json.attrs[name];
      const back = Node.fromJSON(schema, { type: "doc", content: [json] });
      expect(back.firstChild!.attrs[name]).toBe(null);
    },
  );

  it("`dialogue.character` 也適用：default null，往返後不被靜默改寫", () => {
    expect(schema.nodes.dialogue.spec.attrs!.character!.default).toBe(null);

    const dialogueJson = schema
      .node("dialogue", { character: null }, [schema.text("台詞")])
      .toJSON() as { attrs: Record<string, unknown> };
    delete dialogueJson.attrs.character;
    const back = Node.fromJSON(schema, {
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: [dialogueJson] }],
    });
    expect(back.firstChild!.firstChild!.attrs.character).toBe(null);
  });
});

describe("voiceStyle（發聲方式）：不允許 null（§5.3，「要嘛預設 null、要嘛不允許 null」）", () => {
  it("default 是 '一般'，不是 null", () => {
    const spec = schema.nodes.dialogue.spec.attrs!.voiceStyle!;
    expect(spec.default).toBe("一般");
    expect(spec.default).not.toBe(null);
  });

  it("不指定時建出 '一般'", () => {
    const d = schema.node("dialogue", null, [schema.text("台詞")]);
    expect(d.attrs.voiceStyle).toBe("一般");
  });

  it("往返後補回 '一般' 是正確行為（非 null 欄位，default 補值無害）", () => {
    const d = schema.node("dialogue", null, [schema.text("台詞")]);
    const json = d.toJSON() as { attrs: Record<string, unknown> };
    delete json.attrs.voiceStyle;
    const back = Node.fromJSON(schema, { type: "doc", content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: [json] }] });
    expect(back.firstChild!.firstChild!.attrs.voiceStyle).toBe("一般");
  });

  it("塞 null 或列舉外的值：Node.check() 與 Node.fromJSON 會擋下", () => {
    // ProseMirror 的 validate 跑在 check()／fromJSON（載入路徑），不跑在 create()——
    // 持久化的稿被 y-prosemirror 往返或從 DB 載入時，違規值會在這裡被攔。
    expect(() => schema.node("dialogue", { voiceStyle: "旁白" }, []).check()).toThrow(RangeError);
    expect(() => schema.node("dialogue", { voiceStyle: null }, []).check()).toThrow(RangeError);

    const json = schema.node("dialogue", null, []).toJSON() as { attrs: Record<string, unknown> };
    json.attrs.voiceStyle = null;
    expect(() =>
      Node.fromJSON(schema, {
        type: "doc",
        content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: [json] }],
      }),
    ).toThrow(RangeError);
  });

  it("三個合法值都放行", () => {
    for (const v of VOICE_VALUES) {
      expect(() => schema.node("dialogue", { voiceStyle: v }, [])).not.toThrow();
    }
  });
});

describe("time／intExt（時間／內外）：封閉列舉，放行 null、擋列舉外的值（§4.3）", () => {
  it("null 與每個列舉值都往返得回來", () => {
    for (const [attr, values] of [
      ["time", TIME_VALUES],
      ["intExt", INT_EXT_VALUES],
    ] as const) {
      for (const v of [null, ...values]) {
        const doc = makeDoc(makeScene({ [attr]: v }));
        expect(Node.fromJSON(schema, doc.toJSON()).firstChild!.attrs[attr]).toBe(v);
      }
    }
  });

  it("列舉外的值在 Node.fromJSON 被擋下", () => {
    for (const attr of ["time", "intExt"] as const) {
      const json = makeScene().toJSON() as { attrs: Record<string, unknown> };
      json.attrs[attr] = "白天";
      expect(() => Node.fromJSON(schema, { type: "doc", content: [json] })).toThrow(RangeError);
    }
  });
});

describe("其餘不允許 null 的欄位（§5.3）", () => {
  it("manualDraft：default false，非 null；non-boolean 被擋", () => {
    expect(sceneAttrSpec("manualDraft").default).toBe(false);
    expect(makeScene().attrs.manualDraft).toBe(false);
    const json = makeScene().toJSON() as { attrs: Record<string, unknown> };
    json.attrs.manualDraft = "yes";
    expect(() => Node.fromJSON(schema, { type: "doc", content: [json] })).toThrow();
  });

  it("extras（群演）/ dismissedCharacterIds：default 空陣列，非 null", () => {
    expect(sceneAttrSpec("extras").default).toEqual([]);
    expect(sceneAttrSpec("dismissedCharacterIds").default).toEqual([]);
    expect(makeScene().attrs.extras).toEqual([]);
    expect(makeScene().attrs.dismissedCharacterIds).toEqual([]);
  });
});

describe("同一份 schema 餵給 Node.fromJSON（Yjs 升級路徑預留，不實作 Yjs）", () => {
  it("填滿 metadata 的 doc 往返後深度相等且 .eq()", () => {
    const doc = schema.node("doc", null, [
      schema.node(
        "scene",
        {
          sceneId: mintSceneId(),
          time: "夜",
          intExt: "內景",
          location: { locationId: "lo_abc", displayName: "海豚公寓房間" },
          appearingCharacters: [{ characterId: "ch_1", displayName: "小明" }],
          extras: [{ extraId: "ex_1", description: "路人", count: 3 }],
          manualDraft: false,
          dismissedCharacterIds: ["ch_9"],
        },
        [
          schema.node("action", null, [schema.text("小明走進房間。")]),
          schema.node(
            "dialogue",
            { character: { id: "ch_1", displayName: "小明" }, voiceStyle: "V.O." },
            [schema.text("我回來了。")],
          ),
          schema.node("insertShot", null, [schema.text("牆上的時鐘特寫。")]),
        ],
      ),
    ]);

    const back = Node.fromJSON(schema, doc.toJSON());
    expect(back.toJSON()).toEqual(doc.toJSON());
    expect(back.eq(doc)).toBe(true);
  });

  it("雜景多值地點也往返等價", () => {
    const doc = schema.node("doc", null, [
      makeScene({
        intExt: "雜景",
        location: [
          { locationId: "lo_1", displayName: "巷口" },
          { locationId: "lo_2", displayName: "警局" },
        ],
      }),
    ]);
    expect(Node.fromJSON(schema, doc.toJSON()).eq(doc)).toBe(true);
  });
});
