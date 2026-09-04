// @vitest-environment jsdom
/**
 * 票券 32 —— 零場次時的空狀態。
 *
 * doc 的 schema 是 `scene*`：一場都不剩是合法的文件狀態（見 kernel schema.ts／§5.1）。
 * 壞掉的是畫面 —— 「＋ 新增下一場」住在場次腳部，場次沒了它也沒了，contenteditable 高度歸零，
 * 沒有可點的區域。空狀態補上那個出口，而**不是**偷偷補一場（那會弄髒 undo stack 並對文件說謊）。
 *
 * jsdom 下 `editor.chain().focus()` 不搬動 DOM 焦點，但 chip row 的焦點串接走的是真的
 * `HTMLElement.focus()`（見 nodes/scene.tsx），所以「建出來的場次落在內外景欄」查得到。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyScreenplayState } from "./ScreenplayEditor";
import { useScreenplayEditor } from "./use-screenplay-editor";

/** 零場次的 doc —— ⌘+A 全選到整份再刪除、或存了一份空稿之後載入回來的樣子。 */
function emptyDoc() {
  return kernelSchema.node("doc", null, []).toJSON() as object;
}

function docWithOneScene() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("action", null, [kernelSchema.text("內文")]),
      ]),
    ])
    .toJSON() as object;
}

/** ScreenplayEditor 的組合形狀：空狀態與 EditorContent 並排，共用同一個 editor。 */
function Harness({ content, onEditor }: { content: object; onEditor?: (e: Editor) => void }) {
  const editor = useScreenplayEditor(content, "documentEnd");
  useEffect(() => {
    if (editor && onEditor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <>
      <EditorContent editor={editor} />
      <EmptyScreenplayState editor={editor} />
    </>
  );
}

const emptyState = (container: HTMLElement) => container.querySelector(".empty-screenplay");
const emptyStateButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>(".empty-screenplay button");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("零場次的空狀態", () => {
  it("載入一份零場次的稿：出現一句話與可點的「＋ 新增場次」，不是空白畫面", async () => {
    const { container } = render(<Harness content={emptyDoc()} />);

    await waitFor(() => expect(emptyState(container)).not.toBeNull());
    expect(emptyState(container)!.textContent).toContain("這份劇本現在是張白紙。");
    // 「新增場次」不是腳部那顆的「新增下一場」—— 沒有任何一場在，就沒有「下一場」。
    expect(emptyStateButton(container)!.textContent).toContain("＋ 新增場次");
    // ⌘+Enter 是鍵盤使用者唯一看得見的線索 —— 空狀態在時它一直在。
    expect(emptyState(container)!.textContent).toContain("⌘ + Enter");
  });

  it("有場次時不出現（不佔版面）", async () => {
    const { container } = render(<Harness content={docWithOneScene()} />);

    await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());
    expect(emptyState(container)).toBeNull();
  });

  it("從空狀態按下按鈕建出一場，焦點落在新場次的內外景欄（§7.1 焦點串接）", async () => {
    const { container } = render(<Harness content={emptyDoc()} />);
    await waitFor(() => expect(emptyStateButton(container)).not.toBeNull());

    fireEvent.click(emptyStateButton(container)!);

    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(1));
    expect(emptyState(container)).toBeNull();
    const firstField = container.querySelector<HTMLButtonElement>(
      ".scene__chips .scene__chip-control",
    )!;
    // 焦點串接跨了「建場 → 新 node view 掛載 → claim」三步，機器忙時比預設 1s 還久。
    await waitFor(() => expect(document.activeElement).toBe(firstField), { timeout: 3000 });

    // 而且**留得住**：載入零場次的稿時若還排了一個 `focus("end")`（tiptap 走
    // requestAnimationFrame），那一幀會落在按下按鈕之後，把焦點從內外景欄搶回內文 ——
    // 機器越忙越容易發生（CI 上必中）。多等幾幀確認沒有人來搶。
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.activeElement).toBe(firstField);
  });

  it("建出來的場次不帶整場反白（浮現動畫淡出後不會留下底色）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness content={emptyDoc()} onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(emptyStateButton(container)).not.toBeNull());

    // 空 doc 的選取是 `AllSelection(0, 0)`；插入一場之後它會被 map 成罩住整場，
    // 而整場選取的反白與浮現動畫共用 --selection-bg —— 動畫淡出後底色就留在畫面上，
    // 要點進內文才消失（使用者回饋 2026-09-04）。
    fireEvent.click(emptyStateButton(container)!);

    await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("action");
    expect(container.querySelector(".scene")!.classList.contains("is-node-selected")).toBe(false);
  });

  it("把最後一場刪光，空狀態就出現（跟著 doc 更新，不必重新掛載）", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness content={docWithOneScene()} onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());
    expect(emptyState(container)).toBeNull();

    // ⌘+A 按到整份劇本再刪除的結果：doc 一場不剩。
    editor.commands.selectAll();
    editor.commands.deleteSelection();

    await waitFor(() => expect(emptyState(container)).not.toBeNull());
    expect(editor.state.doc.childCount).toBe(0);
  });

  it("刪光之後 ⌘+Z 一次就把整份稿救回來（沒有被自動補的場次卡在歷史裡）", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness content={docWithOneScene()} onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());

    editor.commands.selectAll();
    editor.commands.deleteSelection();
    await waitFor(() => expect(emptyState(container)).not.toBeNull());

    editor.commands.undo();

    await waitFor(() => expect(editor.state.doc.childCount).toBe(1));
    expect(editor.state.doc.textContent).toBe("內文");
    expect(emptyState(container)).toBeNull();
  });

  it("零場次時編輯器不可編輯：打字進不去，也長不出繞過 command bridge 的場次", async () => {
    let editor!: Editor;
    const { container } = render(<Harness content={emptyDoc()} onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(emptyState(container)).not.toBeNull());

    // 編輯器 schema 的 `sceneId` 有 `default: null`（Tiptap 要求），於是 `scene` 在 view 這側
    // 是可生成的：空 doc 上一有輸入，ProseMirror 就自己 createAndFill 出一場把字放進去 ——
    // chip 全空、沒有動畫、注音組字被打斷（使用者回饋 2026-09-04）。contenteditable 關掉就沒這回事。
    await waitFor(() => expect(editor.isEditable).toBe(false));
    expect(editor.view.dom.getAttribute("contenteditable")).toBe("false");

    // 建出一場之後要自己開回來 —— 不然使用者按了按鈕卻打不了字。
    fireEvent.click(emptyStateButton(container)!);
    await waitFor(() => expect(editor.isEditable).toBe(true));
  });

  it("空狀態出現時焦點落在那顆按鈕（否則鍵盤使用者連 ⌘+Z 都按不到）", async () => {
    const { container } = render(<Harness content={emptyDoc()} />);

    await waitFor(() => expect(emptyStateButton(container)).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(emptyStateButton(container)));
  });

  it("空狀態下 ⌘+Enter 一樣建得出場次", async () => {
    let editor!: Editor;
    const { container } = render(<Harness content={emptyDoc()} onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(emptyStateButton(container)).not.toBeNull());

    // 零場次時 contenteditable 是關的，編輯器的鍵盤路徑不通 —— 這顆鍵由空狀態自己接
    // （見 ScreenplayEditor 的 EmptyScreenplayPanel），所以事件打在空狀態上。
    fireEvent.keyDown(emptyState(container)!, { key: "Enter", metaKey: true });

    await waitFor(() => expect(editor.state.doc.childCount).toBe(1));
    expect(emptyState(container)).toBeNull();
  });

  it("空狀態下 ⌘+Z 就把整份稿救回來（刪光是可以反悔的）", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness content={docWithOneScene()} onEditor={(e) => (editor = e)} />,
    );
    await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());

    editor.commands.selectAll();
    editor.commands.deleteSelection();
    await waitFor(() => expect(emptyState(container)).not.toBeNull());

    fireEvent.keyDown(emptyState(container)!, { key: "z", metaKey: true });

    await waitFor(() => expect(editor.state.doc.childCount).toBe(1));
    expect(editor.state.doc.textContent).toBe("內文");
    expect(emptyState(container)).toBeNull();
  });
});
