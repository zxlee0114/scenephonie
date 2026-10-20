// @vitest-environment jsdom
/**
 * 票券 04 的核心保護：apps/web 的 Tiptap schema **必須**與 `@scenephonie/schema` 的 canonical
 * schema JSON 相容。kernel 擁有 node spec；這裡的 Tiptap 擴充只是它的「view 綁定」，一旦漂移，
 * 編輯器存出來的 doc 就餵不進 command 層／`projectScenes`／PDF 匯出。
 */
import { Editor } from "@tiptap/core";
import { docFromJSON, mintGroupId, mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { describe, expect, it } from "vitest";

import { sceneSchemaNodes } from "./schema";
import { baseStarterKit } from "./starter-kit";

function kernelDoc() {
  return kernelSchema.node("doc", null, [
    kernelSchema.node("scene", { sceneId: mintSceneId() }, [
      kernelSchema.node("action", null, [kernelSchema.text("阿明推開玻璃門。")]),
      kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
      kernelSchema.node("insertShot", null, [kernelSchema.text("吧台上缺角的杯。")]),
      kernelSchema.node(
        "subscene",
        { sceneId: mintSceneId(), kind: "接續", time: "夜" },
        [kernelSchema.node("action", null, [kernelSchema.text("他走上陽台。")])],
      ),
      kernelSchema.node("action", null, [kernelSchema.text("回到吧台。")]),
    ]),
    kernelSchema.node(
      "scene",
      {
        sceneId: mintSceneId(),
        time: "夜",
        intExt: "內景",
        location: { locationId: "lo_cafe", displayName: "海邊咖啡廳" },
      },
      [kernelSchema.node("action", null, [])],
    ),
    groupDoc(),
  ]);
}

/** 一個對剪群組（票券 12）：兩個成員、三個片段，其中一段帶著成員自己的子場次。 */
function groupDoc() {
  const a = mintSceneId();
  const b = mintSceneId();
  return kernelSchema.node("sceneGroup", { groupId: mintGroupId() }, [
    kernelSchema.node("groupMember", { sceneId: a, time: "夜", intExt: "內景" }),
    kernelSchema.node("groupMember", { sceneId: b }),
    kernelSchema.node("groupFragment", { memberId: a }, [
      kernelSchema.node("action", null, [kernelSchema.text("若晴推出照片。")]),
    ]),
    kernelSchema.node("groupFragment", { memberId: b }, [
      kernelSchema.node("action", null, [kernelSchema.text("志豪貼著鐵皮牆。")]),
      kernelSchema.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, [
        kernelSchema.node("action", null, [kernelSchema.text("閃回。")]),
      ]),
    ]),
    kernelSchema.node("groupFragment", { memberId: a }, [
      kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("我再問一次。")]),
    ]),
  ]);
}

function makeEditor(content: unknown) {
  return new Editor({
    extensions: [baseStarterKit(), ...sceneSchemaNodes],
    content: content as object,
  });
}

describe("Tiptap schema ↔ @scenephonie/schema 相容", () => {
  it("kernel doc → Tiptap → kernel 往返後 JSON 不變、且能被讀取邊界 hydrate", () => {
    const json = kernelDoc().toJSON();
    const editor = makeEditor(json);
    try {
      const roundTripped = editor.getJSON();
      expect(() => docFromJSON(roundTripped)).not.toThrow();
      expect(docFromJSON(roundTripped).toJSON()).toEqual(json);
    } finally {
      editor.destroy();
    }
  });

  it("節點名集合一致", () => {
    const editor = makeEditor(kernelDoc().toJSON());
    try {
      expect(new Set(Object.keys(editor.schema.nodes))).toEqual(
        new Set(Object.keys(kernelSchema.nodes)),
      );
    } finally {
      editor.destroy();
    }
  });

  it("每個節點的 attr 名集合、isolating／defining 一致", () => {
    const editor = makeEditor(kernelDoc().toJSON());
    try {
      for (const name of Object.keys(kernelSchema.nodes)) {
        const k = kernelSchema.nodes[name]!;
        const t = editor.schema.nodes[name]!;
        expect([name, new Set(Object.keys(k.spec.attrs ?? {}))]).toEqual([
          name,
          new Set(Object.keys(t.spec.attrs ?? {})),
        ]);
        expect([name, !!k.spec.isolating, !!k.spec.defining]).toEqual([
          name,
          !!t.spec.isolating,
          !!t.spec.defining,
        ]);
      }
    } finally {
      editor.destroy();
    }
  });

  it("marks 全關（約束 2）", () => {
    const editor = makeEditor(kernelDoc().toJSON());
    try {
      expect(Object.keys(kernelSchema.marks)).toEqual([]);
      expect(Object.keys(editor.schema.marks)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("doc、scene、subscene 與群組三節點的內容規則一致", () => {
    const editor = makeEditor(kernelDoc().toJSON());
    try {
      for (const name of ["doc", "scene", "subscene", "sceneGroup", "groupMember", "groupFragment"]) {
        expect([name, editor.schema.nodes[name]!.spec.content]).toEqual([
          name,
          kernelSchema.nodes[name]!.spec.content,
        ]);
      }
    } finally {
      editor.destroy();
    }
  });
});
