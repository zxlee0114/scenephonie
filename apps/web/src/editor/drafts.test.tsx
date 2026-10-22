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
import { requestNextScene } from "./extensions/next-scene";
import { PointMenu } from "./point-menu";
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
      <PointMenu />
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

/**
 * 每一場的標籤，與它有沒有掛草稿的視覺區隔。草稿的 gutter 印「草稿」、標籤在 title 裡
 * （使用者裁決 2026-10-22）—— 這裡讀的是標籤。
 */
const gutter = (container: HTMLElement) =>
  [...container.querySelectorAll(".scene")].map((el) => {
    const label = el.querySelector(".scene__label");
    return [label?.getAttribute("title") ?? label?.textContent, el.classList.contains("scene--draft")];
  });

/** 點第 `n` 場的場次號開選單，按下標籤是 `label` 的那一列。 */
async function pickFromMenu(container: HTMLElement, n: number, label: string) {
  fireEvent.click(container.querySelectorAll(".scene__number")[n]!);
  const row = await waitFor(() => {
    const el = [...container.querySelectorAll(".scene-menu button")].find((b) => b.textContent === label);
    expect(el).toBeDefined();
    return el!;
  });
  await act(async () => {
    fireEvent.mouseDown(row);
  });
}

/** 游標放進第 `n` 場（頂層，0 起算）內文的開頭，焦點在內文。 */
async function caretInScene(editor: Editor, n: number) {
  let at = 0;
  editor.state.doc.forEach((node, pos, index) => {
    if (index === n) at = pos + 2;
  });
  await act(async () => {
    editor.chain().focus().setTextSelection(at).run();
  });
}

/** 改第 `n` 場（頂層）的一個 attr —— 不動游標，像 chip row 上的寫入。 */
async function setAttr(editor: Editor, n: number, name: string, value: unknown) {
  let at = 0;
  editor.state.doc.forEach((_node, pos, index) => {
    if (index === n) at = pos;
  });
  await act(async () => {
    editor.view.dispatch(editor.state.tr.setNodeAttribute(at, name, value));
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

  it("gutter 印「草稿」不印標籤：草稿不佔號，就不印一個像號碼的東西；標籤滑過才看得到", async () => {
    const { container } = await mount(docOf(scene("第一場"), scene("沒填完", { ...filled(), time: null })));
    await waitFor(() => expect(container.querySelectorAll(".scene--draft")).toHaveLength(1));
    const label = container.querySelector(".scene--draft .scene__label")!;
    expect(label.textContent).toBe("草稿");
    expect(label.getAttribute("title")).toBe("S1[D1]");
    expect(container.querySelector(".scene:not(.scene--draft) .scene__label")!.hasAttribute("title")).toBe(false);
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

describe("手動標記與自動草稿分得出來（使用者回饋 2026-10-21）", () => {
  it("切換草稿標記不捲動畫面 —— 游標沒動，不該把視窗拉回游標那一場（使用者回饋 2026-10-21）", async () => {
    const { editor, container } = await mount(docOf(scene("第一場"), scene("第二場"), scene("第三場")));
    await caretInScene(editor, 0);
    const scrolled: boolean[] = [];
    editor.on("transaction", ({ transaction }) => scrolled.push(transaction.scrolledIntoView));

    await pickFromMenu(container, 2, "標記為草稿");
    expect(editor.state.doc.child(2).attrs.manualDraft).toBe(true);
    expect(scrolled).not.toContain(true);
  });

  it("手動標記的草稿另掛 scene--draft-manual；自動草稿沒有", async () => {
    const { container } = await mount(
      docOf(scene("第一場"), scene("手動", { ...filled(), manualDraft: true }), scene("沒填完", { ...filled(), time: null })),
    );
    const manual = () => [...container.querySelectorAll(".scene")].map((el) => el.classList.contains("scene--draft-manual"));
    await waitFor(() => expect(manual()).toEqual([false, true, false]));
  });

  it("自動草稿的選單不說「標記為草稿」—— 它已經是草稿，那一列是「固定為草稿」", async () => {
    const { editor, container } = await mount(docOf(scene("第一場"), scene("沒填完", { ...filled(), time: null })));
    fireEvent.click(container.querySelectorAll(".scene__number")[1]!);
    const rows = await waitFor(() => {
      const texts = [...container.querySelectorAll(".scene-menu button")].map((b) => b.textContent);
      expect(texts.length).toBeGreaterThan(0);
      return texts;
    });
    expect(rows).not.toContain("標記為草稿");
    fireEvent.click(container.querySelectorAll(".scene__number")[1]!);

    await pickFromMenu(container, 1, "固定為草稿");
    expect(editor.state.doc.child(1).attrs.manualDraft).toBe(true);
  });
});

describe("離開時才判定（使用者裁決 2026-10-21）：正在寫的那一場畫面上不變", () => {
  it("新增的場次起步是正式場號；游標移到別場，metadata 不完整才轉草稿", async () => {
    const first = scene("第一場");
    const { editor, container } = await mount(docOf(first, scene("第二場")));

    await act(async () => {
      requestNextScene(editor, first.attrs.sceneId as string);
    });
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["2", false],
        ["3", false],
      ]),
    );

    await caretInScene(editor, 0);
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["S1[D1]", true],
        ["2", false],
      ]),
    );
  });

  it("游標回到草稿：填完也維持草稿，直到游標離開才變回正式場號", async () => {
    const { editor, container } = await mount(
      docOf(scene("第一場"), scene("沒填完", { ...filled(), time: null })),
    );
    await caretInScene(editor, 1);
    await setAttr(editor, 1, "time", "夜");
    // 等一輪 decoration 重算 —— 仍是草稿。
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)).toEqual([
      ["1", false],
      ["S1[D1]", true],
    ]);

    await caretInScene(editor, 0);
    await waitFor(() =>
      expect(gutter(container)).toEqual([
        ["1", false],
        ["2", false],
      ]),
    );
  });

  it("焦點進某一場的 chip row 也算進入那一場", async () => {
    const { editor, container } = await mount(
      docOf(scene("第一場"), scene("沒填完", { ...filled(), time: null })),
    );
    await caretInScene(editor, 0);
    const chip = container.querySelectorAll<HTMLElement>(".scene")[1]!.querySelector<HTMLElement>(
      ".scene__chips button, .scene__chips input",
    )!;
    await act(async () => {
      chip.focus();
    });
    await setAttr(editor, 1, "time", "夜");
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)[1]).toEqual(["S1[D1]", true]);

    await caretInScene(editor, 0);
    await waitFor(() => expect(gutter(container)[1]).toEqual(["2", false]));
  });

  it("編輯器整個失焦不算離開 —— 新場次的號碼不會趁編劇不在時變形", async () => {
    const first = scene("第一場");
    const { editor, container } = await mount(docOf(first));
    await act(async () => {
      requestNextScene(editor, first.attrs.sceneId as string);
    });
    await waitFor(() => expect(gutter(container)[1]).toEqual(["2", false]));

    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => {
      outside.focus();
    });
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)[1]).toEqual(["2", false]);
    outside.remove();
  });

  it("焦點在內文時從中段 /next：新場次照樣起步是正式號 —— 整份 replace 把游標 map 走不算「移到別場」", async () => {
    const first = scene("第一場");
    const { editor, container } = await mount(docOf(first, scene("第二場")));
    await caretInScene(editor, 0);
    await act(async () => {
      requestNextScene(editor);
    });
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)).toEqual([
      ["1", false],
      ["2", false],
      ["3", false],
    ]);
  });

  it("在 A 寫字時從選單標記 B 為草稿：A 的鎖不動", async () => {
    const first = scene("第一場");
    const { editor, container } = await mount(docOf(first, scene("第二場"), scene("第三場")));
    await act(async () => {
      requestNextScene(editor, first.attrs.sceneId as string);
    });
    // 新場次（第 2 個）時空還空著、但還在它身上 → 正式號；游標進它的內文繼續寫。
    await caretInScene(editor, 1);
    await pickFromMenu(container, 3, "標記為草稿");
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)).toEqual([
      ["1", false],
      ["2", false],
      ["3", false],
      ["S3[D1]", true],
    ]);
  });

  it("游標進入不重新判定：空著的草稿場次，點進去照樣是草稿", async () => {
    const { editor, container } = await mount(docOf(scene("第一場"), scene("", {})));
    await caretInScene(editor, 0);
    await waitFor(() => expect(gutter(container)[1]).toEqual(["S1[D1]", true]));

    await caretInScene(editor, 1);
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)[1]).toEqual(["S1[D1]", true]);
  });

  it("內文全空的場次離開後轉草稿；寫了內文、離開後才變回正式場號", async () => {
    const first = scene("第一場");
    const { editor, container } = await mount(docOf(first, scene("第二場")));
    await act(async () => {
      requestNextScene(editor, first.attrs.sceneId as string);
    });
    await setAttr(editor, 1, "time", "日");
    await setAttr(editor, 1, "intExt", "內景");
    await setAttr(editor, 1, "location", { locationId: mintLocationId(), displayName: "客廳" });
    await caretInScene(editor, 0);
    await waitFor(() => expect(gutter(container)[1]).toEqual(["S1[D1]", true]));

    await caretInScene(editor, 1);
    await act(async () => {
      editor.commands.insertContent("走進來");
    });
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)[1]).toEqual(["S1[D1]", true]);

    await caretInScene(editor, 0);
    await waitFor(() => expect(gutter(container)[1]).toEqual(["2", false]));
  });

  it("新劇本的第一場還沒開工：一打開就是正式號，不是 [D1]", async () => {
    const { container } = await mount(docOf(scene("", {})));
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(gutter(container)).toEqual([["1", false]]);
  });
});
