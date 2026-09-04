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
import { requestNextScene } from "./extensions/next-scene";

const LAST_LINE = "最後一行";

function scene(text: string, attrs: Record<string, unknown> = {}) {
  return kernelSchema.node("scene", { sceneId: mintSceneId(), ...attrs }, [
    kernelSchema.node("action", null, text ? [kernelSchema.text(text)] : []),
  ]);
}

function docWithTwoScenes() {
  return kernelSchema.node("doc", null, [scene("第一場"), scene(LAST_LINE)]).toJSON() as object;
}

/** 末場是 `/next` 剛建好的樣子：metadata 全空、單一空 action 區塊。 */
function docWithUnfilledLastScene() {
  return kernelSchema.node("doc", null, [scene("第一場"), scene("")]).toJSON() as object;
}

/** 最後一場 chip row 的第一格（「內外」欄）—— 焦點該落的地方。 */
function lastSceneFirstField(container: HTMLElement): HTMLButtonElement | null {
  const scenes = container.querySelectorAll<HTMLElement>(".scene");
  const last = scenes[scenes.length - 1];
  return last?.querySelector<HTMLButtonElement>(".scene__chips .scene__chip-control") ?? null;
}

function Harness({
  initialFocus,
  onEditor,
  content = docWithTwoScenes(),
}: {
  initialFocus: InitialFocus;
  onEditor: (e: Editor) => void;
  content?: object;
}) {
  const editor = useScreenplayEditor(content, initialFocus);
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

describe("載入時最後一場還沒填 metadata（票券 31）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("末場 metadata 全空且無內文：焦點落在該場的 chip row，不是文件末端", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness
        initialFocus="documentEnd"
        content={docWithUnfilledLastScene()}
        onEditor={(e) => (editor = e)}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());

    const controls = () =>
      container.querySelectorAll<HTMLButtonElement>(".scene__chips .scene__chip-control");
    await waitFor(() => expect(controls().length).toBeGreaterThan(1));
    // 每場 chip row 的第一格是「內外」；末場的那一格才是該被搶到的落點。
    await waitFor(() => expect(document.activeElement).toBe(lastSceneFirstField(container)));
  });

  it("末場已填 metadata：焦點仍落在文件末端（票券 26 不回歸）", async () => {
    let editor!: Editor;
    const filled = kernelSchema
      .node("doc", null, [scene("第一場"), scene(LAST_LINE, { intExt: "內景" })])
      .toJSON() as object;
    render(
      <Harness initialFocus="documentEnd" content={filled} onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    await waitFor(() => expect(editor.state.selection.$from.parent.textContent).toBe(LAST_LINE));
  });

  it("末場 metadata 全空但已有內文：不搶回 chip（工作已經在內文裡）", async () => {
    let editor!: Editor;
    render(
      <Harness
        initialFocus="documentEnd"
        content={docWithTwoScenes()}
        onEditor={(e) => (editor = e)}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    await waitFor(() => expect(editor.state.selection.$from.parent.textContent).toBe(LAST_LINE));
  });

  it("末端是人名台詞都空的對白：焦點落在人物欄（不是台詞內文，也不搶回 chip）", async () => {
    let editor!: Editor;
    const tabbed = kernelSchema
      .node("doc", null, [
        scene("第一場"),
        kernelSchema.node("scene", { sceneId: mintSceneId() }, [
          kernelSchema.node("dialogue", null, []),
        ]),
      ])
      .toJSON() as object;
    const { container } = render(
      <Harness initialFocus="documentEnd" content={tabbed} onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    const speaker = () => container.querySelector<HTMLInputElement>(".block__speaker");
    await waitFor(() => expect(speaker()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(speaker()));
    expect(document.activeElement).not.toBe(lastSceneFirstField(container));
  });

  it("對白已填人物：焦點仍落在文件末端的台詞內文", async () => {
    let editor!: Editor;
    const named = kernelSchema
      .node("doc", null, [
        scene("第一場"),
        kernelSchema.node("scene", { sceneId: mintSceneId(), intExt: "內景" }, [
          kernelSchema.node("dialogue", { character: { id: null, displayName: "小明" } }, []),
        ]),
      ])
      .toJSON() as object;
    const { container } = render(
      <Harness initialFocus="documentEnd" content={named} onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    await waitFor(() => expect(editor.state.selection.$from.parent.type.name).toBe("dialogue"));
    expect(document.activeElement).not.toBe(container.querySelector(".block__speaker"));
  });

  it("`/next` 建完場次後，重整前後的焦點落點一致（都在新場次的 chip row）", async () => {
    let editor!: Editor;
    const first = render(
      <Harness initialFocus="documentEnd" onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(editor).toBeDefined());

    requestNextScene(editor, null);
    await waitFor(() =>
      expect(document.activeElement).toBe(lastSceneFirstField(first.container)),
    );
    const saved = editor.getJSON() as object;

    // 重整：同一份稿重新掛一個編輯器（載入路徑 → documentEnd）。
    first.unmount();
    document.body.innerHTML = "";
    let reloaded!: Editor;
    const after = render(
      <Harness initialFocus="documentEnd" content={saved} onEditor={(e) => (reloaded = e)} />,
    );
    await waitFor(() => expect(reloaded).toBeDefined());
    await waitFor(() => expect(document.activeElement).toBe(lastSceneFirstField(after.container)));
  });
});
