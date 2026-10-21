// @vitest-environment jsdom
/**
 * 草稿場次在編輯器裡（票券 14）：推導值走場次號 decoration —— 標籤 `S11[D1]`、`scene--draft`
 * 的視覺區隔 —— 以及場次號選單裡的「標記為草稿」。推導本身的規則在 kernel 測（`drafts.test.ts`）。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mintLocationId, mintSceneId, schema as k } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const filled = () => ({
  time: "日",
  intExt: "內景",
  location: { locationId: mintLocationId(), displayName: "客廳" },
});
const scene = (text: string, attrs: Record<string, unknown> = filled()) =>
  k.node("scene", { sceneId: mintSceneId(), ...attrs }, [action(text)]);
const docOf = (...scenes: PMNode[]) => k.node("doc", null, scenes).toJSON() as object;

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
  await waitFor(() => expect(editor).not.toBeNull());
  await waitFor(() => expect(view.container.querySelector(".scene")).not.toBeNull());
  await waitFor(() => expect(editor!.isInitialized).toBe(true));
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return { editor: editor!, container: view.container };
}

/** 每一場的號碼，與它有沒有掛草稿的視覺區隔。 */
const gutter = (container: HTMLElement) =>
  [...container.querySelectorAll(".scene")].map((el) => [
    el.querySelector(".scene__number")?.textContent,
    el.classList.contains("scene--draft"),
  ]);

/** 點第 `n` 場的場次號開選單，按下標籤是 `label` 的那一列。 */
async function pickFromMenu(container: HTMLElement, n: number, label: string) {
  fireEvent.mouseDown(container.querySelectorAll(".scene__number")[n]!);
  const row = await waitFor(() => {
    const el = [...container.querySelectorAll(".scene-menu button")].find((b) => b.textContent === label);
    expect(el).toBeDefined();
    return el!;
  });
  await act(async () => {
    fireEvent.mouseDown(row);
  });
}

afterEach(cleanup);

describe("草稿在編輯器裡：標籤與視覺區隔", () => {
  it("metadata 不完整的場次印草稿標籤（錨定前一場）、掛 scene--draft；正式場次不受影響", async () => {
    const { container } = await mount(
      docOf(scene("空的", {}), scene("第一場"), scene("沒填完", { ...filled(), time: null }), scene("第二場")),
    );
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["[D1]", true],
        ["1", false],
        ["S1[D1]", true],
        ["2", false],
      ]),
    );
  });

  it("子場次單獨是草稿：只有它掛 scene--draft，主場次照樣是正式場次", async () => {
    const sub = k.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, [action("閃回")]);
    const parent = k.node("scene", { sceneId: mintSceneId(), ...filled() }, [action("客廳"), sub]);
    const { container } = await mount(docOf(parent));
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["S1[D1]", true],
      ]),
    );
  });

  it("欄位填完它自己就變回正式場次 —— 後面的場次號跟著重算", async () => {
    const { editor, container } = await mount(docOf(scene("沒填完", { ...filled(), time: null }), scene("下一場")));
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["[D1]", true],
        ["1", false],
      ]),
    );

    await act(async () => {
      editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "time", "夜"));
    });
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["2", false],
      ]),
    );
  });
});

describe("場次號選單：手動標記為草稿", () => {
  it("標記 → 變成草稿；同一列改成「取消草稿標記」，按下去變回正式場次", async () => {
    const { editor, container } = await mount(docOf(scene("第一場"), scene("第二場")));

    await pickFromMenu(container, 1, "標記為草稿");
    expect(editor.state.doc.child(1).attrs.manualDraft).toBe(true);
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["S1[D1]", true],
      ]),
    );

    await pickFromMenu(container, 1, "取消草稿標記");
    expect(editor.state.doc.child(1).attrs.manualDraft).toBe(false);
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["2", false],
      ]),
    );
  });
});
