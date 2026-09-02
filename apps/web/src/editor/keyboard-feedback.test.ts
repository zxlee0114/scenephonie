// @vitest-environment jsdom
/**
 * 使用者回饋 2026-09-03 的鍵盤回歸樁（headless）：
 *  - `Shift+Enter` 在同一區塊內軟換行（`\n` 文字，非 hardBreak 節點）——`extensions/soft-break`。
 *  - 插入畫面裡的 `Enter`：非空 → 再切一個插入畫面；空 → 換回動作（double enter 跳出）
 *    ——`nodes/blocks` 的 `InsertShotNode.addKeyboardShortcuts`。
 *
 * 用無 React 根的 headless Editor：`InsertShotNode` 是原生 ProseMirror node view（靜態外殼），
 * 不需要 React；`Scene`／`Action`／`Dialogue` 用 schema-only 版本。
 */
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { docFromJSON, mintSceneId } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { InsertShotNode } from "./nodes/blocks";
import { Action, Dialogue, Doc, Scene } from "./schema";
import { SceneIds } from "./extensions/scene-ids";
import { SoftBreak } from "./extensions/soft-break";
import { baseStarterKit } from "./starter-kit";

let editor: Editor;
afterEach(() => editor?.destroy());

function build(blocks: object[]) {
  editor = new Editor({
    extensions: [baseStarterKit(), Doc, Scene, Action, Dialogue, InsertShotNode, SceneIds, SoftBreak],
    content: {
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: blocks }],
    },
  });
  return editor;
}

function blockTypes() {
  const t: string[] = [];
  editor.state.doc.child(0).forEach((n) => t.push(n.type.name));
  return t;
}

/** 游標放到第 `i` 個區塊內文尾端。 */
function caretAtEndOfBlock(i: number) {
  const scene = editor.state.doc.child(0);
  let pos = 2; // doc>scene>block content start
  for (let k = 0; k < i; k++) pos += scene.child(k).nodeSize;
  pos += scene.child(i).content.size;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))));
}

describe("Shift+Enter：同一區塊內軟換行", () => {
  it("插入 \\n（單一 text 節點），且能被讀取邊界 hydrate", () => {
    build([{ type: "action", content: [{ type: "text", text: "走進門" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Shift-Enter");
    editor.commands.insertContent("關上門");

    expect(blockTypes()).toEqual(["action"]); // 沒有切出新區塊
    const block = editor.state.doc.child(0).child(0);
    expect(block.childCount).toBe(1); // 仍是一個 text 節點
    expect(block.textContent).toBe("走進門\n關上門");
    expect(() => docFromJSON(editor.getJSON())).not.toThrow();
  });
});

describe("插入畫面裡的 Enter", () => {
  it("非空 + Enter：再切一個插入畫面（不是預設的動作）", () => {
    build([{ type: "insertShot", content: [{ type: "text", text: "牆上的時鐘" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["insertShot", "insertShot"]);
  });

  it("空 + Enter（double enter）：換回動作，離開插入畫面模式", () => {
    build([
      { type: "insertShot", content: [{ type: "text", text: "牆上的時鐘" }] },
      { type: "insertShot" },
    ]);
    caretAtEndOfBlock(1); // 空的第二個插入畫面

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["insertShot", "action"]);
  });

  it("Enter 不影響其它型別的區塊（動作維持預設 splitBlock）", () => {
    build([{ type: "action", content: [{ type: "text", text: "走" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["action", "action"]);
  });
});
