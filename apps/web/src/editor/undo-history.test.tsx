// @vitest-environment jsdom
/**
 * chip row 上的 ⌘Z（使用者回報 2026-09-10：新建 chip 之後要按兩次才清得掉）。
 *
 * 文件那一側從來只需要一次 —— 一個 chip ＝ 一支 command ＝ 一個 transaction，這裡第一條
 * 測試就是量它。問題出在**那一下到不了 ProseMirror**：Tiptap 的 `NodeView.stopEvent` 把
 * `INPUT` 上的鍵盤事件整個攔在 node view 裡，於是瀏覽器拿去做 input 自己的原生 undo。
 * `forwardHistoryKey` 把它送回去（見 `history-keys.ts`）。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithScene() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId(), intExt: "內景" }, [
        kernelSchema.node("action", null, [kernelSchema.text("內文")]),
      ]),
    ])
    .toJSON() as object;
}

function Harness({ onEditor }: { onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(docWithScene());
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

const undoKey = { key: "z", code: "KeyZ", metaKey: true };

/** 地點欄打一個新名字並定案，回傳輸入框與編輯器。 */
async function newLocationChip(container: HTMLElement) {
  const input = await waitFor(() => {
    const el = container.querySelector<HTMLInputElement>(".scene__chip--location input");
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.change(input, { target: { value: "河堤" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(container.querySelectorAll(".scene__chip--location .entity-chip")).toHaveLength(1),
  );
  return input;
}

describe("chip row 上的 ⌘Z", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("一個新建的 chip ＝ 一支 command ＝ 一次 undo（文件那一側從來沒有兩次）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await newLocationChip(container);

    expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull();
    editor.commands.undo();
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
  });

  it("焦點還在欄位裡時按一次 ⌘Z，chip 就該不見", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    // 事件從 input 冒泡到 .scene__chips 的 onKeyDown —— 那是 ProseMirror 收不到的那一段。
    fireEvent.keyDown(input, undoKey);

    await waitFor(() =>
      expect(container.querySelectorAll(".scene__chip--location .entity-chip")).toHaveLength(0),
    );
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
  });

  it("⌘⇧Z 再把它做回來", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(editor.state.doc.firstChild!.attrs.location).toBeNull());

    fireEvent.keyDown(input, { ...undoKey, shiftKey: true });
    await waitFor(() => expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull());
  });

  it("框裡還有沒定案的字時不接手 —— 那一下的 ⌘Z 是「撤銷我剛打的字」", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.change(input, { target: { value: "警局" } });
    fireEvent.keyDown(input, undoKey);

    // 文件沒有被動到：地點還在。原生 undo 去處理那幾個字，那是它的事。
    expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull();
  });
});
