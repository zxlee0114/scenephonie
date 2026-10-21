// @vitest-environment jsdom
/**
 * React node view 的 `ignoreMutation`（`./nodes/react-mutations`）—— 開著 DevTools 的 Mac Chrome
 * 會讓 Tiptap 的 `isiOS()` 成立（`userAgent` 含 Mac、`ontouchend in document`），預設的
 * `ignoreMutation` 於是把 React 畫外殼的變動讀回，ProseMirror 重建 node view、React 再掛一次，
 * 停不下來（驗收 2026-10-21）。jsdom 重現不了卡死本身；這裡鎖「那個環境下，外殼的變動被忽略、
 * 文字的變動照樣讀回」。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as k } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const docOf = (...tops: PMNode[]) => k.node("doc", null, tops).toJSON() as object;

function Harness({ content, onEditor }: { content: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(content, "documentEnd");
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

async function mount(content: object) {
  let editor: Editor | null = null;
  const view = render(<Harness content={content} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(view.container.querySelector(".block--dialogue")).not.toBeNull());
  await waitFor(() => expect(editor!.isInitialized).toBe(true));
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return { editor: editor!, container: view.container };
}

type Desc = { ignoreMutation(m: unknown): boolean };
const descOf = (editor: Editor, dom: Node) =>
  (editor.view as unknown as { docView: { nearestDesc(n: Node): Desc } }).docView.nearestDesc(dom);

const childList = (target: Node, added: Node[]) =>
  ({ type: "childList", target, addedNodes: added, removedNodes: [], attributeName: null }) as unknown;

// 讓 Tiptap 的 `isiOS()` 成立 —— 開著 DevTools 的 Mac Chrome 就是這樣。jsdom 也沒有
// `isContentEditable`（Tiptap 那條分支要所有增刪的節點都可編輯），照瀏覽器的規則補上。
const realUA = navigator.userAgent;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[contenteditable]")?.getAttribute("contenteditable") === "true";
    },
  });
  Object.defineProperty(navigator, "userAgent", { value: `${realUA} Macintosh`, configurable: true });
  (document as unknown as Record<string, unknown>).ontouchend = null;
});
afterAll(() => {
  Object.defineProperty(navigator, "userAgent", { value: realUA, configurable: true });
  delete (document as unknown as Record<string, unknown>).ontouchend;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).isContentEditable;
});
afterEach(() => cleanup());

describe("React node view 的外殼變動不讀回（isiOS() 誤中時也一樣）", () => {
  it("對白與場次：React 掛上的外殼、搬 contentDOM 都忽略；contentDOM 裡的文字照樣讀回", async () => {
    const scene = k.node("scene", { sceneId: mintSceneId() }, [
      k.node("dialogue", null, [k.text("你遲到十分鐘。")]),
    ]);
    const { editor, container } = await mount(docOf(scene));
    // 編輯器有焦點 —— Tiptap 那條分支的條件之一。
    await act(async () => {
      editor.view.focus();
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));
    });

    const dialogue = container.querySelector(".react-renderer.node-dialogue")!;
    const block = dialogue.querySelector(".block--dialogue")!;
    const content = dialogue.querySelector("[data-node-view-content-react]")!;
    const sceneRenderer = container.querySelector(".react-renderer.node-scene")!;
    const sceneShell = sceneRenderer.firstElementChild!;

    // React 第一次畫出外殼（`div.block` 加進 react-renderer）：忽略。
    expect(descOf(editor, dialogue).ignoreMutation(childList(dialogue, [block]))).toBe(true);
    // Tiptap 把 contentDOM 搬進 `block__content`：忽略。
    expect(descOf(editor, content.parentElement!).ignoreMutation(childList(content.parentElement!, [content]))).toBe(
      true,
    );
    // 場次也一樣。
    expect(descOf(editor, sceneRenderer).ignoreMutation(childList(sceneRenderer, [sceneShell]))).toBe(true);
    // 但打字是 ProseMirror 的事：contentDOM 裡的變動要讀回。
    const text = content.firstChild!;
    expect(descOf(editor, text).ignoreMutation({ type: "characterData", target: text })).toBe(false);
  });
});
