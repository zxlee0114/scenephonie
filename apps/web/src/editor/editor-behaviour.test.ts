// @vitest-environment jsdom
/**
 * 行為測試 —— command bridge、Tab 環、新增下一場、⌘+A 漸進式全選、場次號重算、id 去重。
 * 用**無 node view 的 schema 節點**（`./schema`）＋ 行為擴充建 headless Editor，避開 React 根，
 * 專測邏輯層。node view 的視覺不變式在 `../../invariant-g.test.tsx`。
 */
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { docFromJSON, mintSceneId, projectScenes, schema as kernelSchema } from "@scenephonie/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cycleBlock } from "./extensions/block-cycle";
import { NextScene, requestNextScene } from "./extensions/next-scene";
import { SceneIds } from "./extensions/scene-ids";
import { SceneNumbers } from "./extensions/scene-numbers";
import { progressiveSelectAll } from "./extensions/select-scope";
import { SelectScope } from "./extensions/select-scope";
import { Action, Dialogue, Doc, InsertShot, Scene } from "./schema";
import { baseStarterKit } from "./starter-kit";

function startDoc() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("action", null, [kernelSchema.text("第一場的動作")]),
        kernelSchema.node("action", null, [kernelSchema.text("第一場的第二段")]),
      ]),
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("action", null, [kernelSchema.text("第二場的動作")]),
      ]),
    ])
    .toJSON();
}

let editor: Editor;

beforeEach(() => {
  editor = new Editor({
    extensions: [
      baseStarterKit(),
      Doc,
      Scene,
      Action,
      Dialogue,
      InsertShot,
      SceneIds,
      SceneNumbers,
      SelectScope,
      NextScene,
    ],
    content: startDoc(),
  });
});

afterEach(() => editor.destroy());

const sceneIds = () => projectScenes(editor.state.doc).map((s) => s.sceneId);
const sceneNumbers = () => projectScenes(editor.state.doc).map((s) => s.number);

/** 把游標放進第 `sceneIndex` 場的第 `blockIndex` 個區塊內。 */
function caretInBlock(sceneIndex: number, blockIndex: number) {
  let target = 0;
  let count = 0;
  editor.state.doc.forEach((scene, scenePos) => {
    if (scene.type.name !== "scene") return;
    if (count === sceneIndex) {
      let pos = scenePos + 1;
      for (let i = 0; i < blockIndex; i++) pos += scene.child(i).nodeSize;
      target = pos + 1;
    }
    count += 1;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target))),
  );
}

describe("新增下一場（三入口共用一條路徑）", () => {
  it("在指定場次之後插入、其餘場次身分不變、場次號即時重算", () => {
    const [a, b] = sceneIds();
    const ok = requestNextScene(editor, a); // 用 id 定址（滑鼠入口的形狀）
    expect(ok).toBe(true);

    const after = sceneIds();
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(a); // 保住身分
    expect(after[2]).toBe(b);
    expect(after[1]).not.toBe(a);
    expect(sceneNumbers()).toEqual([1, 2, 3]); // 推導序號重算
  });

  it("不傳 afterSceneId 時接在游標所在場次之後", () => {
    const [a, b] = sceneIds();
    caretInBlock(1, 0); // 游標在第二場
    requestNextScene(editor);
    const after = sceneIds();
    expect(after).toEqual([a, b, after[2]]);
    expect(after[2]).not.toBe(a);
    expect(after[2]).not.toBe(b);
  });

  it("產出的 doc 能被讀取邊界 hydrate", () => {
    requestNextScene(editor);
    expect(() => docFromJSON(editor.getJSON())).not.toThrow();
  });
});

describe("Tab 環（只換型別、不動容器、不生成東西）", () => {
  it("action → dialogue → insertShot → action，場次身分與數量不變", () => {
    caretInBlock(0, 0);
    const before = sceneIds();

    cycleBlock(editor, 1);
    expect(blockTypeAt(0, 0)).toBe("dialogue");
    cycleBlock(editor, 1);
    expect(blockTypeAt(0, 0)).toBe("insertShot");
    cycleBlock(editor, 1);
    expect(blockTypeAt(0, 0)).toBe("action");

    expect(sceneIds()).toEqual(before); // 沒有生成任何場次
    expect(editor.state.doc.childCount).toBe(2);
  });

  it("Shift+Tab 反向一步：action → insertShot", () => {
    caretInBlock(1, 0);
    cycleBlock(editor, -1);
    expect(blockTypeAt(1, 0)).toBe("insertShot");
  });

  it("轉成對白保留原本的行內內容", () => {
    caretInBlock(0, 0);
    cycleBlock(editor, 1);
    expect(textAt(0, 0)).toBe("第一場的動作");
  });
});

function nthScene(i: number) {
  let hit = null as null | ReturnType<typeof editor.state.doc.child>;
  let count = 0;
  editor.state.doc.forEach((scene) => {
    if (scene.type.name !== "scene") return;
    if (count === i) hit = scene;
    count += 1;
  });
  return hit!;
}
function blockTypeAt(sceneIndex: number, blockIndex: number) {
  return nthScene(sceneIndex).child(blockIndex).type.name;
}
function textAt(sceneIndex: number, blockIndex: number) {
  return nthScene(sceneIndex).child(blockIndex).textContent;
}

describe("⌘+A 漸進式全選", () => {
  it("區塊 → 本場內文 → 整場（含 metadata）→ 整份", () => {
    caretInBlock(0, 0); // 第一場有兩段，區塊層與內文層才分得開

    progressiveSelectAll(editor);
    const s1 = editor.state.selection;
    expect(s1 instanceof TextSelection).toBe(true);
    expect(s1.$from.parent.textContent).toBe("第一場的動作"); // 只有這一段

    progressiveSelectAll(editor);
    const s2 = editor.state.selection;
    expect(s2 instanceof TextSelection).toBe(true);
    expect(s2.to - s2.from).toBeGreaterThan(s1.to - s1.from); // 擴到整場內文（兩段）

    progressiveSelectAll(editor);
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe("scene");

    progressiveSelectAll(editor);
    expect(editor.state.selection.from).toBeLessThanOrEqual(1);
    expect(editor.state.selection.to).toBeGreaterThanOrEqual(editor.state.doc.content.size - 1);
  });
});

describe("不變式 ⑥：同一份 doc 內 sceneId 不得重複", () => {
  it("貼上（複製）一個同 id 的場次 → 去重換掉新插入的那份", () => {
    const [a] = sceneIds();
    const dup = kernelSchema
      .node("scene", { sceneId: a }, [kernelSchema.node("action", null, [kernelSchema.text("副本")])])
      .toJSON();
    const node = editor.schema.nodeFromJSON(dup);
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, node));

    const ids = sceneIds();
    expect(new Set(ids).size).toBe(ids.length); // 無重複
    expect(ids[0]).toBe(a); // 文件順序在前者保留
  });

  it("缺 id 的場次會被補鑄", () => {
    const noId = editor.schema.nodeFromJSON({
      type: "scene",
      attrs: { sceneId: null },
      content: [{ type: "action" }],
    });
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, noId));
    for (const id of sceneIds()) {
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^sc_/);
    }
  });
});
