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

function build(...blocks: object[]) {
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
      content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: blocks }],
    },
  });
  // 游標放進最後一個（空的）區塊，然後打一個 `/`。
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)),
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

describe("`/next` 不留下承載指令的空區塊（票券 30）", () => {
  const withText = (text: string) => ({
    type: "action",
    content: [{ type: "text", text }],
  });

  it("在空行打 `/next`：原場次不留空白區塊", async () => {
    await build(withText("內文"), { type: "action" });

    pressEnter();

    expect(editor.state.doc.childCount).toBe(2); // 確實建了下一場
    expect(blockTypes()).toEqual(["action"]); // 空的承載區塊被收掉了
    expect(editor.state.doc.child(0).child(0).textContent).toBe("內文");
  });

  it("本場唯一的區塊上打 `/next`：區塊留著（schema 是 sceneBlock+）", async () => {
    await build({ type: "action" });

    pressEnter();

    expect(editor.state.doc.childCount).toBe(2);
    expect(blockTypes()).toEqual(["action"]);
  });

  // `/` 前面得是空白或區塊開頭（Suggestion 的 allowedPrefixes 預設），所以「緊接內文打 `/`」
  // 不會彈選單。真正可達的是「內文＋空格＋`/next`」—— 刪掉指令後區塊還有內容，不能收掉。
  it("內文後面接 `/next`：刪掉指令後區塊還有內容，留著", async () => {
    await build(withText("內文 "));

    pressEnter();

    expect(editor.state.doc.childCount).toBe(2);
    expect(blockTypes()).toEqual(["action"]);
    expect(editor.state.doc.child(0).child(0).textContent).toBe("內文 ");
  });

  it("新的一場接在原場次之後，不是接在全劇最後", async () => {
    // 游標在第一場（刪掉空區塊後 selection 可能離開場次 —— 那時 afterSceneId 會退化成 null，
    // 新場次就會被接到全劇最後面去）。
    await build(withText("內文"), { type: "action" });
    const firstSceneId = editor.state.doc.child(0).attrs.sceneId as string;

    pressEnter();

    expect(editor.state.doc.child(0).attrs.sceneId).toBe(firstSceneId);
    expect(editor.state.doc.childCount).toBe(2);
  });
});
