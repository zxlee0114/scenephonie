// @vitest-environment jsdom
/**
 * 票券 34 —— chip row 與場次內文之間的**方向鍵**往返。
 *
 * Tab 那條路是單向的（metadata 一格一格串進內文，進去就回不來），因為 chip row 是
 * `contentEditable={false}`，ProseMirror 的游標進不去。這裡釘住補上的那條雙向路：
 *
 * - 場次**第一個區塊的第一行**按 ↑ → 焦點落在本場 chip row 的**最後一格**（群演欄），
 *   **doc 一個字都不動**。
 * - chip row 任一格按 ↓ → 游標回本場第一個區塊（那條逃生鍵：不必 Tab 走完剩下的格子）。
 * - **自動補全選單開著時，上下鍵是選單的** —— 只有選單關著才是離開欄位。
 *
 * Tab／Shift+Tab 的環一個字都沒改（§7.3）：環要能按回來，讓它在某個位置離開就不對稱了。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const scene = (blocks: unknown[]) =>
  kernelSchema.node("scene", { sceneId: mintSceneId() }, blocks as never);

const action = (text: string) => kernelSchema.node("action", null, [kernelSchema.text(text)]);
const dialogue = (text: string) =>
  kernelSchema.node("dialogue", { character: null }, [kernelSchema.text(text)]);

const docJSON = (...scenes: unknown[]) =>
  kernelSchema.node("doc", null, scenes as never).toJSON() as object;

function Harness({ doc, onEditor }: { doc: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

/** 把游標放進第 `sceneIndex` 場第一個區塊的內文（開頭）。 */
function caretInFirstBlock(editor: Editor, sceneIndex = 0) {
  let pos = 0;
  editor.state.doc.forEach((node, offset, index) => {
    if (index === sceneIndex) pos = offset + 2;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))),
  );
}

/** 走瀏覽器同一條路徑派一顆方向鍵到編輯器（`keyboardShortcut` 會包 transaction，對不上）。 */
function pressInBody(editor: Editor, key: string) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

const sceneAt = (container: HTMLElement, i: number) =>
  container.querySelectorAll<HTMLElement>(".scene")[i]!;

const extrasInput = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>(".scene__chip--extras input")!;

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(doc: object) {
  let editor!: Editor;
  const { container } = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(container.querySelector(".scene__chip--extras input")).not.toBeNull());
  return { container, editor: () => editor };
}

describe("內文 → chip row（↑）", () => {
  it("第一個區塊的第一行按 ↑ → 焦點落在本場群演欄，內容一個字都沒變", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    const before = JSON.stringify(editor().getJSON());
    caretInFirstBlock(editor());
    pressInBody(editor(), "ArrowUp");

    await waitFor(() => expect(document.activeElement).toBe(extrasInput(container)));
    expect(JSON.stringify(editor().getJSON())).toBe(before);
  });

  it("非第一場：↑ 進的是**本場** chip row，不是上一場內文", async () => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([action("第二場")])),
    );

    caretInFirstBlock(editor(), 1);
    pressInBody(editor(), "ArrowUp");

    await waitFor(() => expect(document.activeElement).toBe(extrasInput(sceneAt(container, 1))));
  });

  it("第一個區塊是對白時：台詞 ↑ 進人物欄，人物欄再 ↑ 進本場 chip row（不跨到上一場）", async () => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([dialogue("還有位子嗎？")])),
    );

    caretInFirstBlock(editor(), 1);
    pressInBody(editor(), "ArrowUp");

    const speaker = sceneAt(container, 1).querySelector<HTMLInputElement>(".block__speaker")!;
    await waitFor(() => expect(document.activeElement).toBe(speaker));

    fireEvent.keyDown(speaker, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).toBe(extrasInput(sceneAt(container, 1))));
  });
});

describe("chip row → 內文（↓）", () => {
  const caretIsInBody = (editor: Editor) => {
    const { $from, empty } = editor.state.selection;
    return empty && $from.parent.type.name === "action" && $from.parentOffset === 0;
  };

  // 五格逐一釘住 —— 「任一格」是這條逃生鍵的重點：編劇多半只填了前兩格就想開始寫，
  // 而前兩格正是下拉（它們的 ↓ 語意住在 `chip-select.tsx`，其餘三格住在 `chipExitHandler`）。
  it.each([
    ["內外景（下拉）", "內外"],
    ["時間（下拉）", "時間"],
    ["地點欄", "地點"],
    ["登場人物欄", "登場人物"],
    ["群演欄", "群演"],
  ])("%s 按 ↓ → 游標回本場第一個區塊", async (_label, label) => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    // 游標先擺在別處，才看得出 ↓ 真的把它搬回第一個區塊開頭。
    editor().commands.setTextSelection(editor().state.doc.content.size - 2);

    // 用無障礙標籤定位，不靠 chip row 的排列順序。
    const cell = container.querySelector<HTMLElement>(
      `.scene__chips [aria-label="${label}"]`,
    )!;
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowDown" });

    await waitFor(() => expect(caretIsInBody(editor())).toBe(true));
  });

  it("第二場的 chip row 按 ↓ → 進的是第二場的內文", async () => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([action("第二場")])),
    );

    const cell = extrasInput(sceneAt(container, 1));
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowDown" });

    await waitFor(() => {
      const { $from } = editor().state.selection;
      expect($from.parent.textContent).toBe("第二場");
    });
  });
});

describe("離開欄位不吃掉打到一半的字", () => {
  // Esc 只關選單、字留在框裡（`EntityField` 的「現在別煩我」）。那之後按 ↓ 離開欄位，
  // 走的是與 Tab 相同的那條 blur 回寫 —— 打完就走是常態，不該把字吃掉。
  it("群演欄：Esc 關掉選單後按 ↓，那串字仍然定案成 chip", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const input = extrasInput(container);
    input.focus();
    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() =>
      expect(container.querySelector(".scene__chip--extras .entity-chip")?.textContent).toContain(
        "咖啡廳客人",
      ),
    );
  });
});

describe("選單開著時，上下鍵是選單的", () => {
  it("群演欄：選單開著按 ↓ 不離開欄位", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    const input = extrasInput(container);
    input.focus();
    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });
    await waitFor(() =>
      expect(container.querySelector(".scene__chip--extras .entity-field__menu")).not.toBeNull(),
    );

    const selectionBefore = editor().state.selection.from;
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(document.activeElement).toBe(input);
    expect(editor().state.selection.from).toBe(selectionBefore);
  });

  it("登場人物欄：選單開著按 ↑／↓ 移動選項，不離開欄位", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const input = container.querySelector<HTMLInputElement>(".scene__chip--character input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "小明" } });
    await waitFor(() =>
      expect(container.querySelector(".scene__chip--character .entity-field__menu")).not.toBeNull(),
    );

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(document.activeElement).toBe(input);
  });

  it("內外景下拉：選單開著時 ↓ 移動選項而不是離開欄位", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    const trigger = container.querySelector<HTMLButtonElement>(
      ".scene__chips .scene__chip-control",
    )!;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" }); // 開選單
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();

    editor().commands.setTextSelection(editor().state.doc.content.size - 2);
    const selectionBefore = editor().state.selection.from;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
    expect(editor().state.selection.from).toBe(selectionBefore);
  });
});
