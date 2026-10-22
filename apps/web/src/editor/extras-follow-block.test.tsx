// @vitest-environment jsdom
/**
 * 對白帶著群演離開原場次（票券 13，使用者驗收 2026-10-22）。
 *
 * 對白的人物欄可以指「本場的群演」，群演是場次限定實體。區塊被剪下貼到別場時，引用跟著走、定義
 * 沒有 —— 那顆 chip 在新的那場指不到任何東西；點它、選「建立新實體」之後，說話者整個不見。
 * 定義怎麼補在 kernel（`commands/extra-adoption.test.ts`）；這裡測編輯器接上之後編劇看到的。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mintExtraId, mintSceneId, sceneExtras, schema as k } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

function Harness({ doc, onEditor }: { doc: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider initial={{ characters: [], locations: [] }}>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

async function mount(doc: object) {
  let editor: Editor | null = null;
  const { container } = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor?.isInitialized).toBe(true));
  return { editor: editor!, container };
}

afterEach(cleanup);

const waiters = (extraId: string) => ({ extraId, description: "服務生", countValue: { kind: "exact", count: 2 } });
const line = (extraId: string) =>
  k.node("dialogue", { character: { id: extraId, displayName: "服務生" } }, [k.text("歡迎光臨")]);

describe("對白帶著群演離開原場次", () => {
  it("剪下對白貼到別場：那筆群演跟著補進新的那一場，chip 照樣指得到", async () => {
    const extraId = mintExtraId();
    const doc = k.node("doc", null, [
      k.node("scene", { sceneId: mintSceneId(), extras: [waiters(extraId)] }, [k.node("action", null, [k.text("咖啡廳")]), line(extraId)]),
      k.node("scene", { sceneId: mintSceneId() }, [k.node("action", null, [k.text("街上")])]),
    ]).toJSON() as object;
    const { editor } = await mount(doc);
    const dialoguePos = 1 + editor.state.doc.child(0).child(0).nodeSize;
    act(() => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, dialoguePos)));
    });
    const { dom } = editor.view.serializeForClipboard(editor.state.selection.content());
    act(() => {
      editor.view.dispatch(editor.state.tr.deleteSelection());
      const end = editor.state.doc.content.size - 2; // 「街上」的末端
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)));
      editor.view.pasteHTML(dom.innerHTML, new Event("paste") as ClipboardEvent); // jsdom 沒有 ClipboardEvent
    });
    const moved = editor.state.doc.child(1);
    expect(moved.lastChild!.type.name).toBe("dialogue");
    expect(sceneExtras(moved.attrs.extras)).toEqual([waiters(extraId)]);
  });

  it("懸空的群演 chip（定義沒跟上）選「建立新實體」：照字面建一筆人物，說話者不會不見", async () => {
    const extraId = mintExtraId();
    const doc = k.node("doc", null, [
      k.node("scene", { sceneId: mintSceneId(), extras: [waiters(extraId)] }, [k.node("action", null, [k.text("咖啡廳")])]),
      k.node("scene", { sceneId: mintSceneId() }, [line(extraId)]),
    ]).toJSON() as object;
    const { editor, container } = await mount(doc);
    const chip = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(".block__speaker-field .entity-chip");
      expect(el).not.toBeNull();
      return el!;
    });
    act(() => {
      fireEvent.mouseDown(chip);
    });
    const create = await waitFor(() => {
      const row = [...container.querySelectorAll<HTMLElement>(".block__speaker-field .entity-field__menu li")].find((li) =>
        li.textContent?.includes("建立新實體"),
      );
      expect(row).toBeDefined();
      return row!;
    });
    await act(async () => {
      fireEvent.mouseDown(create);
      fireEvent.click(create);
    });
    await waitFor(() => {
      const speaker = editor.state.doc.child(1).child(0).attrs.character as { id: string; displayName: string } | null;
      expect(speaker?.displayName).toBe("服務生");
      expect(speaker?.id.startsWith("ex_")).toBe(false);
    });
  });
});
