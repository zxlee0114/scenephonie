// @vitest-environment jsdom
/**
 * 跨場次選取的刪除／打字／貼上（票券 13、§7.5 成本 1 與 5）—— 用真的編輯器組裝跑。
 *
 * 拖曳繞過 `isolating`，但 `isolating` 留著；子場次多一層巢狀之後，鍵盤選取／刪除／貼上的邊界要
 * 重測：跨場次（含主場次 ↔ 子場次）的編輯不准把兩場合併、讓 `sceneId` 消失。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as k } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { allSceneIds } from "./address";
import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const scene = (blocks: PMNode[]) => k.node("scene", { sceneId: mintSceneId() }, blocks);
const sub = (blocks: PMNode[]) => k.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, blocks);

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

/** A：客廳 ＋ 子場次（回憶）＋ 回來；B：街上；C：夜。 */
async function mount() {
  const content = k.node("doc", null, [
    scene([action("客廳"), sub([action("回憶")]), action("回來")]),
    scene([action("街上")]),
    scene([action("夜")]),
  ]).toJSON() as object;
  let editor: Editor | null = null;
  render(<Harness content={content} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).not.toBeNull());
  await waitFor(() => expect(editor!.isInitialized).toBe(true));
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return { editor: editor! };
}

afterEach(cleanup);

/** 頂層每一場的內文（子場次以 `[…]` 標出）。 */
function outline(editor: Editor): string[][] {
  const out: string[][] = [];
  editor.state.doc.forEach((top) => {
    const row: string[] = [];
    top.forEach((c) => row.push(c.type.name === "subscene" ? `[${c.textContent}]` : c.textContent));
    out.push(row);
  });
  return out;
}

describe("isolating 保留：鍵盤刪除不跨場次合併", () => {
  /** 第 `n` 個 textblock 內文的開頭／末端（依文件順序）。 */
  function textPos(editor: Editor, n: number, place: "start" | "end") {
    let seen = -1;
    let at: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (at != null) return false;
      if (!node.isTextblock) return true;
      seen += 1;
      if (seen === n) at = pos + 1 + (place === "end" ? node.content.size : 0);
      return false;
    });
    return at!;
  }

  const key = (editor: Editor, k: string) =>
    act(() => {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });

  // textblock 序：0 客廳、1 回憶（子場次）、2 回來、3 街上、4 夜
  it.each([
    ["下一場開頭按 ⌫（主場次 ↔ 主場次）", 3, "start", "Backspace"],
    ["子場次開頭按 ⌫（子場次 → 主場次）", 1, "start", "Backspace"],
    ["子場次末端按 Delete（子場次 → 主場次）", 1, "end", "Delete"],
    ["子場次之後那一行開頭按 ⌫（主場次 → 子場次）", 2, "start", "Backspace"],
  ] as const)("%s：場次一個都不少", async (_label, block, place, k) => {
    const { editor } = await mount();
    const ids = allSceneIds(editor.state.doc);
    act(() => {
      const pos = textPos(editor, block, place);
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
    });
    key(editor, k);
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
  });

  /** 選 `[a 的第 1 個字之後, b 的第 1 個字之後)`。 */
  function selectAcross(editor: Editor, a: number, b: number) {
    act(() => {
      const from = textPos(editor, a, "start") + 1;
      const to = textPos(editor, b, "start") + 1;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
    });
  }

  // 選取「各場各自刪、不接起來」：每段內容只刪被選到的字，中間整個被選到的區塊拿掉（一段內容至少
  // 留一個、不以子場次開頭），場次與子場次本身一個不少（使用者決定 2026-10-22）。
  it.each([
    ["主場次中間 → 下一場中間", 2, 3, [["客廳", "[回憶]", "回"], ["上"], ["夜"]]],
    ["主場次中間 → 子場次中間", 0, 1, [["客", "[憶]", "回來"], ["街上"], ["夜"]]],
    ["子場次中間 → 下一場中間", 1, 3, [["客廳", "[回]"], ["上"], ["夜"]]],
    ["跨三場", 2, 4, [["客廳", "[回憶]", "回"], [""], [""]]],
  ] as const)("跨場次選取按 ⌫（%s）：各場各自刪，沒有任何兩場被併成一場", async (_l, a, b, expected) => {
    const { editor } = await mount();
    const ids = allSceneIds(editor.state.doc);
    selectAcross(editor, a, b);
    key(editor, "Backspace");
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
    expect(outline(editor)).toEqual(expected);
  });

  it("跨場次選取時打字：先各場各自刪，字落在起點", async () => {
    const { editor } = await mount();
    const ids = allSceneIds(editor.state.doc);
    selectAcross(editor, 1, 3);
    act(() => {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, "X", () => editor.state.tr));
      expect(handled).toBe(true);
    });
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
    expect(outline(editor)).toEqual([["客廳", "[回X]"], ["上"], ["夜"]]);
  });

  it("跨場次選取時貼上：先各場各自刪，貼在起點", async () => {
    const { editor } = await mount();
    const ids = allSceneIds(editor.state.doc);
    selectAcross(editor, 1, 3);
    act(() => {
      const slice = new Slice(Fragment.from(editor.schema.text("貼")), 0, 0);
      const handled = editor.view.someProp("handlePaste", (f) => f(editor.view, new Event("paste") as ClipboardEvent, slice));
      expect(handled).toBe(true);
    });
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
    expect(outline(editor)).toEqual([["客廳", "[回貼]"], ["上"], ["夜"]]);
  });

  it("同一場之內的選取照 ProseMirror 原生行為（會接起來）", async () => {
    const { editor } = await mount();
    act(() => {
      const from = textPos(editor, 3, "start") + 1;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + 1)));
    });
    key(editor, "Backspace");
    expect(outline(editor)[1]).toEqual(["街"]);
  });
});
