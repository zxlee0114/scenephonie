// @vitest-environment jsdom
/**
 * §7.1 —— 人物欄的鍵盤行為。
 *
 * - Tab（**兩個方向**）都不能冒泡到 BlockCycle 把對白轉成別的型別／破壞欄位。
 * - Enter：打完人物名直接進台詞（不要「按了沒反應」的錯愕）——使用者回饋 2026-09-03。
 * - 對白內文按 Enter：起一段新對白，焦點落在**新那段的人物欄**（說話者重新指定）
 *   ——使用者回饋 2026-09-03（第三輪）。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenplayEditor } from "./ScreenplayEditor";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithDialogue() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
      ]),
    ])
    .toJSON() as object;
}

/** 動作在前、對白在後 —— 初始游標落在動作，好驗證 Enter 是否真的把游標跳進對白內文。 */
function docActionThenDialogue() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
        kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
      ]),
    ])
    .toJSON() as object;
}

function Harness({ onEditor }: { onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(docActionThenDialogue());
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return <EditorContent editor={editor} />;
}

describe("人物欄的 Tab 不冒泡到 BlockCycle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Shift+Tab 在人物欄不會把對白轉回動作", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithDialogue()} />);
    await waitFor(() => expect(container.querySelector(".block--dialogue")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    expect(speaker).not.toBeNull();
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "Tab", shiftKey: true });
    fireEvent.keyDown(speaker, { key: "Tab" });

    // 區塊仍是對白，且沒有多長出場次
    expect(container.querySelector(".block--dialogue")).not.toBeNull();
    expect(container.querySelector(".block--action")).toBeNull();
    expect(container.querySelectorAll(".scene").length).toBe(1);
  });
});

describe("人物欄按 Enter 直接進台詞", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Enter 把游標送進對白內文（不再是按了沒反應）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "Enter" });

    // jsdom 下 editor.chain().focus() 不搬 DOM 焦點，改查 ProseMirror selection。
    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.type.name).toBe("dialogue");
    });
  });

  it("對白內文按 Enter：起一段新對白，焦點落在新那段的人物欄", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block--dialogue")).not.toBeNull());

    // 游標放進「還有位子嗎？」這段對白內文尾端（action nodeSize + 進 dialogue + 內容長度）。
    const scene = editor.state.doc.child(0);
    const dialogueBodyEnd = 1 + scene.child(0).nodeSize + 1 + scene.child(1).content.size;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.near(editor.state.doc.resolve(dialogueBodyEnd)),
      ),
    );

    editor.commands.keyboardShortcut("Enter");

    // 原本的對白之後多了一段對白（前面那個 action 不動）。
    await waitFor(() => expect(container.querySelectorAll(".block--dialogue").length).toBe(2));
    const scene2 = editor.state.doc.child(0);
    expect([scene2.child(1).type.name, scene2.child(2).type.name]).toEqual(["dialogue", "dialogue"]);
    expect(scene2.child(2).attrs.character).toBeNull(); // 新那段說話者清空

    // 焦點落在新那段（第二個）的人物欄。
    const speakers = container.querySelectorAll<HTMLInputElement>(".block__speaker");
    await waitFor(() => expect(document.activeElement).toBe(speakers[speakers.length - 1]));
  });

  it("組字中的 Enter 不動作（isComposing）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "Enter", isComposing: true });

    // 游標沒有被搬進對白內文（維持在初始的動作區塊）。
    expect(editor.state.selection.$from.parent.type.name).toBe("action");
  });
});
