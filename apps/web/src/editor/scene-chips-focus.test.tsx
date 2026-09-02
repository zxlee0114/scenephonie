// @vitest-environment jsdom
/**
 * 票券 04 驗收 #1、#3 —— chip row 的焦點行為。
 *
 * #1：進入編輯器時，焦點落在第一場的「內外景」欄（不必先用滑鼠點 chip row）。
 * #3：內外景 → 時間 → 地點 →（正向 Tab）游標落進本場第一個區塊開始撰寫；腳部「＋新增下一場」
 *     `tabIndex=-1`，不進 tab 序（它是滑鼠入口，另有快捷鍵與 `/next`）。
 *
 * jsdom 下 `editor.chain().focus()` 不會搬動 DOM 焦點，所以 #3 正向那條查 ProseMirror 的
 * selection（游標真的進了 `action` 內文），而非 `document.activeElement`。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithScene() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
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
  return <EditorContent editor={editor} />;
}

describe("進入編輯器的初始焦點", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("焦點落在第一場的「內外景」下拉（ChipSelect 的觸發鈕）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() =>
      expect(container.querySelector(".scene__chips .scene__chip-control")).not.toBeNull(),
    );
    void editor;

    const firstControl = container.querySelector<HTMLButtonElement>(
      ".scene__chips .scene__chip-control",
    )!;
    await waitFor(() => expect(document.activeElement).toBe(firstControl));
    // 「內外景」是 chip row 第一格；未選時觸發鈕顯示 placeholder。
    expect(firstControl.textContent).toBe("內外");
  });
});

describe("chip row 的 Tab 終點是場次內文", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("地點欄正向 Tab → 游標進入本場第一個區塊內文，不落在腳部按鈕", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".scene__chips input")).not.toBeNull());

    const location = container.querySelector<HTMLInputElement>(".scene__chips input")!;
    location.focus();
    fireEvent.keyDown(location, { key: "Tab" });

    const { $from, empty } = editor.state.selection;
    expect(empty).toBe(true);
    expect($from.parent.type.name).toBe("action");
    expect($from.parentOffset).toBe(0); // 內文開頭
    expect(document.activeElement?.closest(".scene__foot")).toBeNull();
  });

  it("腳部「＋新增下一場」不在 tab 序（tabIndex=-1）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".scene__foot button")).not.toBeNull());
    void editor;

    const foot = container.querySelector<HTMLButtonElement>(".scene__foot button")!;
    expect(foot.tabIndex).toBe(-1);
  });
});
