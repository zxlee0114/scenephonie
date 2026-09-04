// @vitest-environment jsdom
/**
 * 點選單外面就收起來（票券 29，使用者回饋 2026-09-04：「點擊編輯器外部依舊關不了選單」）。
 *
 * 這支跑的是真的 `SlashMenu` 元件配真的 suggestion plugin —— `dismiss-on-outside-pointer` 的
 * 單元測試只證明那個 helper 會叫 close，證不到它有沒有被接上去。
 */
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { render, screen, waitFor } from "@testing-library/react";
import { mintSceneId } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { ContinueBlock } from "./extensions/continue-block";
import { NextScene } from "./extensions/next-scene";
import { SceneIds } from "./extensions/scene-ids";
import { SceneNumbers } from "./extensions/scene-numbers";
import { Slash, SlashMenu } from "./extensions/slash";
import { SoftBreak } from "./extensions/soft-break";
import { Action, Dialogue, Doc, InsertShot, Scene } from "./schema";
import { baseStarterKit } from "./starter-kit";

let editor: Editor;
afterEach(() => {
  editor?.destroy();
  document.body.innerHTML = "";
});

/** 建一份只有一場的稿，游標停在空的動作區塊，然後打一個 `/` 把選單叫出來。 */
async function openMenu() {
  render(<SlashMenu />);
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
      content: [
        { type: "scene", attrs: { sceneId: mintSceneId() }, content: [{ type: "action" }] },
      ],
    },
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
  editor.commands.insertContent("/");
  await waitFor(() => expect(screen.getByText("新增下一場")).toBeTruthy());
}

const menuEl = () => document.querySelector(".slash-menu");

describe("slash 選單的關閉路徑", () => {
  it("點編輯器外面（header、頁面留白）就收起來", async () => {
    await openMenu();

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    await waitFor(() => expect(menuEl()).toBeNull());
  });

  it("點選單自己不關 —— 那一下是要選項目", async () => {
    await openMenu();

    menuEl()!.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(menuEl()).not.toBeNull();
  });
});
