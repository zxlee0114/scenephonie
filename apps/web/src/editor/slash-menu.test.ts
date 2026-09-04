// @vitest-environment jsdom
/**
 * `/` 斜線選單的兩條回歸樁（使用者回饋 2026-09-03，第五輪）：
 *
 *  1. 選單開著時 `Enter` 要**選取項目**，不是換行 —— `slash` 的 priority 必須壓過
 *     `continueBlock`（1101）／`softBreak`（1100）。Tiptap 依 priority 由高到低把外掛排進
 *     ProseMirror，`handleKeyDown` 誰先排到誰先吃事件。
 *  2. `/` 只在**動作**區塊是指令入口；對白內文與插入畫面裡的斜線是內容，不彈選單，
 *     `Enter` 照常延續當前區塊型別。
 *
 * 用**真的 keydown 事件**打 `view.dom`，不用 `editor.commands.keyboardShortcut()`：後者把整段
 * 包在 `captureTransaction` 裡重放，而「新增下一場」是兩次 dispatch（先刪 `/xxx`、再換整份 doc），
 * 重放時第二次的位置會對不上。瀏覽器的 Enter 走的正是這裡測的這條路。
 */
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { mintSceneId } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { ContinueBlock } from "./extensions/continue-block";
import { NextScene } from "./extensions/next-scene";
import { SceneIds } from "./extensions/scene-ids";
import { SceneNumbers } from "./extensions/scene-numbers";
import { Slash } from "./extensions/slash";
import { SoftBreak } from "./extensions/soft-break";
import { Action, Dialogue, Doc, InsertShot, Scene } from "./schema";
import { baseStarterKit } from "./starter-kit";

let editor: Editor;
afterEach(() => editor?.destroy());

function build(block: object) {
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
      NextScene,
      SoftBreak,
      ContinueBlock,
      Slash,
    ],
    content: {
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: [block] }],
    },
  });
  // 游標放進那個（空的）區塊，然後打一個 `/`。
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(2))),
  );
  editor.commands.insertContent("/");
  // Suggestion 的 items／render 走 promise，onStart 落在 microtask 之後。
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function pressEnter() {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
}

function blockTypes() {
  const t: string[] = [];
  editor.state.doc.child(0).forEach((n) => t.push(n.type.name));
  return t;
}

describe("斜線選單開著時的 Enter", () => {
  it("動作區塊：Enter 執行第一項（新增下一場），不是換行", async () => {
    await build({ type: "action" });

    pressEnter();

    // 選單第一項是「新增下一場」→ 多一場，而且 `/` 這個字元被吃掉、動作沒有被切成兩段。
    expect(editor.state.doc.childCount).toBe(2);
    expect(blockTypes()).toEqual(["action"]);
    expect(editor.state.doc.child(0).textContent).toBe("");
  });
});

describe("斜線只在動作區塊是指令入口", () => {
  it("對白內文打 `/`：不彈選單，Enter 照常切出下一段對白", async () => {
    await build({ type: "dialogue" });

    pressEnter();

    expect(editor.state.doc.childCount).toBe(1); // 沒有被「新增下一場」攔走
    expect(blockTypes()).toEqual(["dialogue", "dialogue"]);
    expect(editor.state.doc.child(0).child(0).textContent).toBe("/"); // 斜線留在內容裡
  });

  it("插入畫面打 `/`：不彈選單，Enter 照常切出下一個插入畫面", async () => {
    await build({ type: "insertShot" });

    pressEnter();

    expect(editor.state.doc.childCount).toBe(1);
    expect(blockTypes()).toEqual(["insertShot", "insertShot"]);
    expect(editor.state.doc.child(0).child(0).textContent).toBe("/");
  });
});
