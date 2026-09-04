// @vitest-environment jsdom
/**
 * 票券 26 —— 進站時的初始焦點分兩種情形（§7.1 的適用範圍，不是推翻它）。
 *
 * 新建的劇本：焦點落在第一場的「內外景」欄（「請你先填這裡」的引導，由
 * `scene-chips-focus.test.tsx` 守著）。載入既有劇本：焦點落在文件末端（「你上次寫到這裡」）。
 *
 * jsdom 下 `focus()` 不會搬動 DOM 焦點，所以這裡查的是 ProseMirror 的 selection ——
 * 游標真的停在最後一場的最後一個區塊末端。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { InitialFocus } from "./use-screenplay-editor";
import { useScreenplayEditor } from "./use-screenplay-editor";

const LAST_LINE = "最後一行";

function docWithTwoScenes() {
  const scene = (text: string) =>
    kernelSchema.node("scene", { sceneId: mintSceneId() }, [
      kernelSchema.node("action", null, [kernelSchema.text(text)]),
    ]);
  return kernelSchema.node("doc", null, [scene("第一場"), scene(LAST_LINE)]).toJSON() as object;
}

function Harness({
  initialFocus,
  onEditor,
}: {
  initialFocus: InitialFocus;
  onEditor: (e: Editor) => void;
}) {
  const editor = useScreenplayEditor(docWithTwoScenes(), initialFocus);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return <EditorContent editor={editor} />;
}

describe("載入既有劇本時的初始焦點", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("游標停在最後一場的最後一個區塊末端", async () => {
    let editor!: Editor;
    render(<Harness initialFocus="documentEnd" onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());

    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.textContent).toBe(LAST_LINE);
      expect($from.parentOffset).toBe($from.parent.content.size); // 區塊末端
    });
  });

  it("接著輸入，內容出現在最後一個區塊末端", async () => {
    let editor!: Editor;
    render(<Harness initialFocus="documentEnd" onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());
    await waitFor(() => expect(editor.state.selection.$from.parent.textContent).toBe(LAST_LINE));

    // 不搬動 selection，直接在游標處插入 —— 模擬「進站不必點一下就能打字」。
    editor.commands.insertContent("續寫");

    const scenes = editor.state.doc;
    expect(scenes.lastChild!.lastChild!.textContent).toBe(`${LAST_LINE}續寫`);
  });

  it("新建劇本不回歸：焦點請求仍是第一場的 chip row", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness initialFocus="sceneMeta" onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() =>
      expect(container.querySelector(".scene__chips .scene__chip-control")).not.toBeNull(),
    );
    const firstControl = container.querySelector<HTMLButtonElement>(
      ".scene__chips .scene__chip-control",
    )!;
    await waitFor(() => expect(document.activeElement).toBe(firstControl));
    expect(editor.state.selection.$from.parent.textContent).not.toBe(LAST_LINE);
  });
});
