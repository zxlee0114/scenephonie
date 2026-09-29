// @vitest-environment jsdom
/**
 * 登場人物提示（票券 10）。
 *
 * **提示不是推導**：推導替編劇做決定，提示只指出落差、決定權在他手上。觸發條件是
 * 「某人物在本場有**一般**發聲方式的對白，且不在本場的登場人物欄」—— 判準住在 kernel
 * （`unlistedSpeakers`），這裡量的是**時機與出口**：
 *
 * - 寫完一句對白**按 Enter** 時才問：Enter 被攔下、焦點交給選單，選完才開下一個區塊；
 *   點走、方向鍵走出去都不問（使用者裁決 2026-09-29，驗收回饋）；
 * - 選單浮在那一句的台詞底下；↑↓ 走列、**沒有預選**，Enter 只打在亮起的那一列上；
 * - `＋ 新增為登場人物` 寫進登場人物欄；`✕ 不新增 —— 他不入鏡` 寫進 `dismissedCharacterIds`；
 * - **Esc 不記錄任何判斷**（「現在別煩我」）但照樣開下一段 —— 下次在那一句按 Enter 還會再問；
 *   點到別處只收起，不開下一段。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintCharacterId,
  mintSceneId,
  sceneAppearingCharacters,
  schema as kernelSchema,
} from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { blockContentPos } from "./command-bridge";
import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const xiaoming = mintCharacterId();
const xiaohua = mintCharacterId();
const CHARACTERS = [
  { id: xiaoming, name: "小明" },
  { id: xiaohua, name: "小華" },
];

/** 一場：小明說一句（發聲方式可換），接著一段動作 —— 離開那句對白的落點。 */
function sceneDoc(
  { voiceStyle = "一般", attrs = {} }: { voiceStyle?: string; attrs?: Record<string, unknown> } = {},
) {
  const sceneId = mintSceneId();
  const doc = kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId, ...attrs }, [
        kernelSchema.node(
          "dialogue",
          { character: { id: xiaoming, displayName: "小明" }, voiceStyle },
          [kernelSchema.text("生日快樂")],
        ),
        kernelSchema.node("action", null, [kernelSchema.text("他吹熄蠟燭")]),
      ]),
    ])
    .toJSON() as object;
  return { sceneId, doc };
}

function Harness({ doc, onEditor }: { doc: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc, "documentEnd");
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider initial={{ characters: CHARACTERS, locations: [] }}>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

async function mount(doc: object) {
  let editor: Editor | null = null;
  const view = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).not.toBeNull());
  await waitFor(() => expect(view.container.querySelector(".block--dialogue")).not.toBeNull());
  return { ...view, editor: editor! };
}

/** 游標放進第 `blockIndex` 個區塊的內文 —— 編劇點進去或用方向鍵走過去都是這個 transaction。 */
function caretInto(editor: Editor, sceneId: string, blockIndex: number, place: "start" | "end" = "end") {
  const pos = blockContentPos(editor.state.doc, sceneId, blockIndex, place)!;
  act(() => {
    editor.commands.setTextSelection(pos);
  });
}

/**
 * 內文裡按一顆鍵（焦點在編輯器上）。走真的 keydown，不走 `commands.keyboardShortcut` —— 後者
 * 只把 handler dispatch 的 steps 抄過來，打開選單那一筆只有 meta，會整個被丟掉。
 */
function press(editor: Editor, key: string) {
  act(() => {
    editor.commands.focus();
    fireEvent.keyDown(editor.view.dom, { key });
  });
}

/** 寫完那句台詞、按 Enter。 */
function writeThenEnter(editor: Editor, sceneId: string) {
  caretInto(editor, sceneId, 0);
  press(editor, "Enter");
}

const prompt = (root: HTMLElement) => root.querySelector<HTMLElement>(".appearing-prompt");
const rowsOf = (root: HTMLElement) =>
  [...(prompt(root)?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");
const row = (root: HTMLElement, text: string) =>
  [...(prompt(root)?.querySelectorAll<HTMLElement>("li") ?? [])].find((li) =>
    (li.textContent ?? "").includes(text),
  )!;
const lit = (root: HTMLElement) =>
  [...(prompt(root)?.querySelectorAll("li.is-active") ?? [])].map((li) => li.textContent ?? "");
/** 選單上按一顆鍵（焦點在選單上）。 */
const menuKey = (root: HTMLElement, key: string) => fireEvent.keyDown(prompt(root)!, { key });

const scene = (editor: Editor) => editor.state.doc.child(0);
const sceneAttrs = (editor: Editor) => scene(editor).attrs;
const blockTypes = (editor: Editor) => {
  const types: string[] = [];
  scene(editor).forEach((b) => types.push(b.type.name));
  return types;
};

afterEach(() => {
  cleanup();
});

describe("什麼時候問", () => {
  it("寫完一句「一般」對白按 Enter → 台詞底下問、焦點在選單上、下一段還沒開", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);

    writeThenEnter(editor, sceneId);

    await waitFor(() => expect(prompt(container)).not.toBeNull());
    const dialogue = prompt(container)!.closest(".block--dialogue")!;
    expect(dialogue).not.toBeNull();
    const lines = dialogue.querySelector(".block__content")!;
    expect(lines.compareDocumentPosition(prompt(container)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prompt(container)!.textContent).toContain("小明");
    expect(rowsOf(container)).toEqual(["＋ 新增為登場人物", "✕ 不新增 —— 他不入鏡"]);
    await waitFor(() => expect(document.activeElement).toBe(prompt(container)));
    expect(blockTypes(editor)).toEqual(["dialogue", "action"]);
  });

  it.each(["V.O.", "O.S."])("標了 %s 絕不提示 —— Enter 照常開下一段", async (voiceStyle) => {
    const { sceneId, doc } = sceneDoc({ voiceStyle });
    const { container, editor } = await mount(doc);

    writeThenEnter(editor, sceneId);

    await act(async () => {});
    expect(prompt(container)).toBeNull();
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]);
  });

  it("已經在登場人物欄 → 不問，Enter 照常", async () => {
    const { sceneId, doc } = sceneDoc({
      attrs: { appearingCharacters: [{ characterId: xiaoming, displayName: "小明" }] },
    });
    const { container, editor } = await mount(doc);

    writeThenEnter(editor, sceneId);

    await act(async () => {});
    expect(prompt(container)).toBeNull();
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]);
  });

  it("只有 Enter 會問：游標從那一句走出去不問", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);

    caretInto(editor, sceneId, 0);
    caretInto(editor, sceneId, 1);

    await act(async () => {});
    expect(prompt(container)).toBeNull();
  });

  it("懸空引用不問 —— 目錄裡沒有那筆人物，Enter 照常開下一段", async () => {
    const sceneId = mintSceneId();
    const doc = kernelSchema
      .node("doc", null, [
        kernelSchema.node("scene", { sceneId }, [
          kernelSchema.node("dialogue", { character: { id: mintCharacterId(), displayName: "阿盈" } }, [
            kernelSchema.text("好久不見"),
          ]),
          kernelSchema.node("action", null, [kernelSchema.text("她轉身")]),
        ]),
      ])
      .toJSON() as object;
    const { container, editor } = await mount(doc);

    writeThenEnter(editor, sceneId);

    await waitFor(() => expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]));
    expect(prompt(container)).toBeNull();
  });
});

describe("出口：選完才開下一段", () => {
  it("＋ 新增為登場人物 → 接進登場人物欄隊尾，選單收起，下一段對白開出來", async () => {
    const { sceneId, doc } = sceneDoc({
      attrs: { appearingCharacters: [{ characterId: xiaohua, displayName: "小華" }] },
    });
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    fireEvent.mouseDown(row(container, "新增為登場人物"));

    await waitFor(() =>
      expect(sceneAppearingCharacters(sceneAttrs(editor).appearingCharacters)).toEqual([
        { characterId: xiaohua, displayName: "小華" },
        { characterId: xiaoming, displayName: "小明" },
      ]),
    );
    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]);
    expect(scene(editor).child(0).textContent).toBe("生日快樂");
  });

  it("Enter 被攔在台詞中間時，選完就在那個位置切開", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    const start = blockContentPos(editor.state.doc, sceneId, 0, "start")!;
    act(() => {
      editor.commands.setTextSelection(start + 2);
    });
    press(editor, "Enter");
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    fireEvent.mouseDown(row(container, "不新增"));

    await waitFor(() => expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]));
    expect(scene(editor).child(0).textContent).toBe("生日");
    expect(scene(editor).child(1).textContent).toBe("快樂");
  });

  it("✕ 不新增 → 記進 dismissedCharacterIds、登場人物欄不動；之後那一句按 Enter 不再問", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    fireEvent.mouseDown(row(container, "不新增"));

    await waitFor(() => expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([xiaoming]));
    expect(sceneAttrs(editor).appearingCharacters).toBeNull();
    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]);

    writeThenEnter(editor, sceneId);
    await act(async () => {});
    expect(prompt(container)).toBeNull();
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "dialogue", "action"]);
  });

  it("Esc ＝ 現在別煩我：什麼都不記、照樣開下一段；下次在那一句按 Enter 還會再問", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    menuKey(container, "Escape");

    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]);
    expect(sceneAttrs(editor).appearingCharacters).toBeNull();
    expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([]);

    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
  });

  it("點到別處 → 只收起：不記錄、也不開下一段", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([]);
    expect(blockTypes(editor)).toEqual(["dialogue", "action"]);
  });
});

describe("鍵盤（焦點在選單上）", () => {
  it("沒有預選：選單出現時沒有任何一列亮著，Enter 什麼都不做", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    expect(lit(container)).toEqual([]);
    // 打開它的正是一顆 Enter —— 連按第二下不該替他做決定。
    menuKey(container, "Enter");

    await act(async () => {});
    expect(prompt(container)).not.toBeNull();
    expect(sceneAttrs(editor).appearingCharacters).toBeNull();
    expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([]);
    expect(blockTypes(editor)).toEqual(["dialogue", "action"]);
  });

  it("↓ 亮起第一列、再 ↓ 換到下一列；↑ 從沒亮的狀態亮起最後一列", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    menuKey(container, "ArrowDown");
    await waitFor(() => expect(lit(container)).toEqual(["＋ 新增為登場人物"]));
    menuKey(container, "ArrowDown");
    await waitFor(() => expect(lit(container)).toEqual(["✕ 不新增 —— 他不入鏡"]));

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(prompt(container)).toBeNull());
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
    menuKey(container, "ArrowUp");
    await waitFor(() => expect(lit(container)).toEqual(["✕ 不新增 —— 他不入鏡"]));
  });

  it("Enter 打在亮起的那一列上 ＝ 選它，接著開下一段", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    menuKey(container, "ArrowDown");
    await waitFor(() => expect(lit(container)).toEqual(["＋ 新增為登場人物"]));
    menuKey(container, "Enter");

    await waitFor(() =>
      expect(sceneAppearingCharacters(sceneAttrs(editor).appearingCharacters)).toEqual([
        { characterId: xiaoming, displayName: "小明" },
      ]),
    );
    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(blockTypes(editor)).toEqual(["dialogue", "dialogue", "action"]);
  });

  it("選單開著時的其他鍵不碰內文 —— Backspace 不刪台詞", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenEnter(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    menuKey(container, "Backspace");

    await act(async () => {});
    expect(scene(editor).child(0).textContent).toBe("生日快樂");
    expect(prompt(container)).not.toBeNull();
  });
});
