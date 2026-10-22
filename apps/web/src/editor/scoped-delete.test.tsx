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
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mintGroupId, mintSceneId, schema as k } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { allSceneIds } from "./address";
import { dropScoped } from "./extensions/scoped-delete";
import { EntityCatalogProvider } from "./entity-catalog";
import { MergeConfirm } from "./merge-confirm";
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
      <MergeConfirm />
    </EntityCatalogProvider>
  );
}

/** 預設：A：客廳 ＋ 子場次（回憶）＋ 回來；B：街上；C：夜。 */
async function mount(
  content = k.node("doc", null, [
    scene([action("客廳"), sub([action("回憶")]), action("回來")]),
    scene([action("街上")]),
    scene([action("夜")]),
  ]).toJSON() as object,
) {
  let editor: Editor | null = null;
  render(<Harness content={content} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).not.toBeNull());
  await waitFor(() => expect(editor!.isInitialized).toBe(true));
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return { editor: editor! };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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

  it("選取從某個區塊的開頭起、那個區塊整個被選到：打的字留在起點那一場，不跑到下一場", async () => {
    const { editor } = await mount();
    act(() => {
      const from = textPos(editor, 2, "start");
      const to = textPos(editor, 3, "start") + 1;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
    });
    act(() => {
      const { from, to } = editor.state.selection;
      editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, "X", () => editor.state.tr));
    });
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "X"], ["上"], ["夜"]]);
  });

  it("跨場次選取按 Enter：先各場各自刪，再在起點斷行", async () => {
    const { editor } = await mount();
    const ids = allSceneIds(editor.state.doc);
    selectAcross(editor, 2, 3);
    key(editor, "Enter");
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回", ""], ["上"], ["夜"]]);
  });

  it("剪下跨場次的選取：各場各自刪（剪貼簿照原生）", async () => {
    const { editor } = await mount();
    const ids = allSceneIds(editor.state.doc);
    selectAcross(editor, 2, 3);
    await act(async () => {
      fireEvent.cut(editor.view.dom, { clipboardData: { setData() {}, clearData() {}, getData: () => "" } });
      await Promise.resolve();
    });
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回"], ["上"], ["夜"]]);
  });

  it("跨群組片段的選取：每個片段各自刪，片段一個不少", async () => {
    const m1 = k.node("groupMember", { sceneId: mintSceneId() });
    const m2 = k.node("groupMember", { sceneId: mintSceneId() });
    const fragment = (m: PMNode, text: string) =>
      k.node("groupFragment", { memberId: m.attrs.sceneId as string }, [action(text)]);
    const content = k.node("doc", null, [
      k.node("sceneGroup", { groupId: mintGroupId() }, [m1, m2, fragment(m1, "甲一"), fragment(m2, "乙二"), fragment(m1, "丙三")]),
    ]).toJSON() as object;
    const { editor } = await mount(content);
    selectAcross(editor, 0, 1);
    key(editor, "Backspace");
    const fragments: string[] = [];
    editor.state.doc.child(0).forEach((c) => {
      if (c.type.name === "groupFragment") fragments.push(c.textContent);
    });
    expect(fragments).toEqual(["甲", "二", "丙三"]);
  });

  describe("其餘會併掉場次的編輯（注音組字蓋過選取…）：先問", () => {
    /** 不經上面幾條路、照 ProseMirror 原生把跨場次的選取換掉的那一筆。 */
    const nativeReplace = (editor: Editor) =>
      act(() => {
        editor.view.dispatch(editor.state.tr.insertText("注"));
      });

    it("先不動，跳出確認；取消 ＝ 什麼都沒發生", async () => {
      const { editor } = await mount();
      const before = editor.state.doc.toJSON();
      selectAcross(editor, 2, 3);
      nativeReplace(editor);
      expect(editor.state.doc.toJSON()).toEqual(before);
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog.textContent).toContain("1 場");
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "取消" }));
      });
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(editor.state.doc.toJSON()).toEqual(before);
    });

    it("確定 ＝ 照原本那一下做（場次被併掉）；⌘Z 一步回來", async () => {
      const { editor } = await mount();
      const before = editor.state.doc.toJSON();
      selectAcross(editor, 2, 3);
      nativeReplace(editor);
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "仍要合併" }));
      });
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(outline(editor)).toEqual([["客廳", "[回憶]", "回注上"], ["夜"]]);
      act(() => {
        editor.commands.undo();
      });
      expect(editor.state.doc.toJSON()).toEqual(before);
    });

    it("勾「不再提醒」再確定：之後同樣的編輯直接做，不再問", async () => {
      const { editor } = await mount();
      selectAcross(editor, 2, 3);
      nativeReplace(editor);
      act(() => {
        fireEvent.click(screen.getByRole("checkbox", { name: "不再提醒" }));
        fireEvent.click(screen.getByRole("button", { name: "仍要合併" }));
      });
      selectAcross(editor, 0, 1); // 客|廳 → 回|憶：子場次被併掉
      nativeReplace(editor);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(outline(editor)).toEqual([["客注憶", "回注上"], ["夜"]]);
    });

    it("確認窗開著時 doc 變了：那一筆作廢，按確定也不做", async () => {
      const { editor } = await mount();
      selectAcross(editor, 2, 3);
      nativeReplace(editor);
      const after = await act(async () => {
        editor.view.dispatch(editor.state.tr.insertText("新", 2));
        return editor.state.doc.toJSON();
      });
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "仍要合併" }));
      });
      expect(editor.state.doc.toJSON()).toEqual(after);
    });
  });

  describe("貼上、拖放跨場的片段：拿掉場次的殼，只放區塊（不長出新場次、不拆場次）", () => {
    /** 把目前的選取複製下來、游標移到第 `n` 個 textblock 的末端、貼上（走真的剪貼簿 HTML）。 */
    function copyThenPasteAtEnd(editor: Editor, n: number) {
      const { dom } = editor.view.serializeForClipboard(editor.state.selection.content());
      act(() => {
        const at = textPos(editor, n, "end");
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
        editor.view.pasteHTML(dom.innerHTML, new Event("paste") as ClipboardEvent); // jsdom 沒有 ClipboardEvent
      });
    }

    it("複製跨場的字（回|來 → 街|上）貼到別場：只多出區塊，場次一個不多、一個不少", async () => {
      const { editor } = await mount();
      const ids = allSceneIds(editor.state.doc);
      selectAcross(editor, 2, 3);
      copyThenPasteAtEnd(editor, 4);
      expect(allSceneIds(editor.state.doc)).toEqual(ids);
      expect(outline(editor)).toEqual([["客廳", "[回憶]", "回來"], ["街上"], ["夜來", "街"]]);
    });

    it("整場（⌘A 選起整場）複製貼上：照舊貼成新的一場、換新 sceneId（§6.5 去重）", async () => {
      const { editor } = await mount();
      const ids = allSceneIds(editor.state.doc);
      act(() => {
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, editor.state.doc.child(0).nodeSize)));
      });
      copyThenPasteAtEnd(editor, 4);
      const after = allSceneIds(editor.state.doc);
      expect(after).toHaveLength(ids.length + 1);
      expect(new Set(after).size).toBe(after.length);
      expect(outline(editor)).toContainEqual(["街上"]);
    });

    it("拖走跨場的字放到別場：來源各場各自刪，落點只多出區塊，不必問", async () => {
      const { editor } = await mount();
      const ids = allSceneIds(editor.state.doc);
      selectAcross(editor, 2, 3);
      act(() => {
        const slice = editor.view.someProp("transformPasted", (f) => f(editor.state.selection.content(), editor.view, false)) ?? editor.state.selection.content();
        const tr = dropScoped(editor.state, textPos(editor, 4, "end"), slice);
        if (tr) editor.view.dispatch(tr);
      });
      expect(allSceneIds(editor.state.doc)).toEqual(ids);
      expect(outline(editor)).toEqual([["客廳", "[回憶]", "回"], ["上"], ["夜來", "街"]]);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("放回選取範圍裡面：什麼都不做", async () => {
      const { editor } = await mount();
      const before = editor.state.doc.toJSON();
      selectAcross(editor, 2, 3);
      expect(dropScoped(editor.state, textPos(editor, 3, "start"), editor.state.selection.content())).toBeNull();
      expect(editor.state.doc.toJSON()).toEqual(before);
    });
  });
});
