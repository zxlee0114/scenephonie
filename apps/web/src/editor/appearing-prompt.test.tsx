// @vitest-environment jsdom
/**
 * 登場人物提示（票券 10）。
 *
 * **提示不是推導**：推導替編劇做決定，提示只指出落差、決定權在他手上。觸發條件是
 * 「某人物在本場有**一般**發聲方式的對白，且不在本場的登場人物欄」—— 判準住在 kernel
 * （`unlistedSpeakers`），這裡量的是**時機與出口**：
 *
 * - 編劇**離開一句對白**時才問，排在那一句的台詞底下；不搶焦點、不擋打字；
 * - 選單開著時 ↑↓ 歸它、沒有預選；Enter 只在有亮起的列時才算選擇；
 * - `＋ 新增為登場人物` 寫進登場人物欄；`✕ 不新增 —— 他不入鏡` 寫進 `dismissedCharacterIds`；
 * - **Esc 不記錄任何判斷**（「現在別煩我」）—— 下次離開那一句還會再問。
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

/** 寫完那句台詞、走到下一段 —— 「離開這句對白」。 */
function writeThenLeave(editor: Editor, sceneId: string) {
  caretInto(editor, sceneId, 0);
  caretInto(editor, sceneId, 1);
}

const prompt = (root: HTMLElement) => root.querySelector<HTMLElement>(".appearing-prompt");
const rowsOf = (root: HTMLElement) =>
  [...(prompt(root)?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");
const row = (root: HTMLElement, text: string) =>
  [...(prompt(root)?.querySelectorAll<HTMLElement>("li") ?? [])].find((li) =>
    (li.textContent ?? "").includes(text),
  )!;

const sceneAttrs = (editor: Editor) => editor.state.doc.child(0).attrs;

afterEach(() => {
  cleanup();
});

describe("什麼時候問", () => {
  it("離開一句「一般」對白、說話者不在登場人物欄 → 在那一句的台詞底下問", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);

    writeThenLeave(editor, sceneId);

    await waitFor(() => expect(prompt(container)).not.toBeNull());
    // 錨在那一句對白上，不是下一段；排在台詞**之後**，不蓋住剛寫完的字。
    const dialogue = prompt(container)!.closest(".block--dialogue")!;
    expect(dialogue).not.toBeNull();
    const lines = dialogue.querySelector(".block__content")!;
    expect(lines.compareDocumentPosition(prompt(container)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prompt(container)!.textContent).toContain("小明");
    expect(rowsOf(container)).toEqual(["＋ 新增為登場人物", "✕ 不新增 —— 他不入鏡"]);
  });

  it("還在那一句裡時不問 —— 他還沒寫完", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);

    caretInto(editor, sceneId, 0, "start");
    caretInto(editor, sceneId, 0, "end");

    expect(prompt(container)).toBeNull();
  });

  it.each(["V.O.", "O.S."])("標了 %s 絕不提示", async (voiceStyle) => {
    const { sceneId, doc } = sceneDoc({ voiceStyle });
    const { container, editor } = await mount(doc);

    writeThenLeave(editor, sceneId);

    // 給它一次重繪的機會再斷言「沒有」。
    await act(async () => {});
    expect(prompt(container)).toBeNull();
  });

  it("已經在登場人物欄 → 不問", async () => {
    const { sceneId, doc } = sceneDoc({
      attrs: { appearingCharacters: [{ characterId: xiaoming, displayName: "小明" }] },
    });
    const { container, editor } = await mount(doc);

    writeThenLeave(editor, sceneId);

    await act(async () => {});
    expect(prompt(container)).toBeNull();
  });

  it("人物欄定案那一刻不問 —— kernel command 整份 replace 不算「離開」（使用者否決過這個時機）", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    caretInto(editor, sceneId, 0);

    const input = container.querySelector<HTMLInputElement>(".block__speaker-field input")!;
    fireEvent.change(input, { target: { value: "小華" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(JSON.stringify(editor.state.doc.child(0).child(0).attrs.character)).toContain("小華"),
    );

    // 多等一下：定案之後還有 focus 相關的 transaction 接著進來，太早斷言會假性通過。
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(prompt(container)).toBeNull();
  });

  it("在對白開頭按 Backspace 併進上一段 —— 不把下一句的說話者掛到錯的地方", async () => {
    const sceneId = mintSceneId();
    const doc = kernelSchema
      .node("doc", null, [
        kernelSchema.node("scene", { sceneId }, [
          kernelSchema.node("action", null, [kernelSchema.text("他走進來")]),
          kernelSchema.node("dialogue", { character: { id: xiaoming, displayName: "小明" } }, [
            kernelSchema.text("嗨"),
          ]),
          kernelSchema.node("dialogue", { character: { id: xiaohua, displayName: "小華" } }, [
            kernelSchema.text("你好"),
          ]),
          // 初始焦點落在文件末端 —— 放一段動作，免得游標一開始就站在小華那一句裡。
          kernelSchema.node("action", null, [kernelSchema.text("兩人握手")]),
        ]),
      ])
      .toJSON() as object;
    const { container, editor } = await mount(doc);
    caretInto(editor, sceneId, 1, "start");

    act(() => {
      editor.commands.joinBackward();
    });

    await act(async () => {});
    // 小明那一句併進動作裡了；就算要問，也不該問到小華（他那一句根本沒被碰過）。
    expect(prompt(container)?.textContent ?? "").not.toContain("小華");
  });

  it("懸空引用不問 —— 目錄裡沒有那筆人物，「＋ 新增」會是一個按不下去的承諾", async () => {
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

    writeThenLeave(editor, sceneId);

    await act(async () => {});
    expect(prompt(container)).toBeNull();
  });

  it("載入時不問 —— 編劇還沒走進任何一句對白", async () => {
    const { doc } = sceneDoc();
    const { container } = await mount(doc);

    await act(async () => {});
    expect(prompt(container)).toBeNull();
  });
});

describe("三個出口", () => {
  it("＋ 新增為登場人物 → 接進登場人物欄，選單收起，游標留在他正在寫的地方", async () => {
    const { sceneId, doc } = sceneDoc({
      attrs: { appearingCharacters: [{ characterId: xiaohua, displayName: "小華" }] },
    });
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
    // 游標**不在** doc 末端 —— 整份 replace 會把座標 map 到一端，停在末端量不出差別。
    caretInto(editor, sceneId, 1, "start");
    const caret = editor.state.selection.from;

    fireEvent.mouseDown(row(container, "新增為登場人物"));

    await waitFor(() =>
      expect(sceneAppearingCharacters(sceneAttrs(editor).appearingCharacters)).toEqual([
        { characterId: xiaohua, displayName: "小華" },
        { characterId: xiaoming, displayName: "小明" },
      ]),
    );
    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(editor.state.selection.from).toBe(caret);
  });

  it("✕ 不新增 → 記進 dismissedCharacterIds、登場人物欄不動；之後離開那一句不再問", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    fireEvent.mouseDown(row(container, "不新增"));

    await waitFor(() => expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([xiaoming]));
    expect(sceneAttrs(editor).appearingCharacters).toBeNull();
    await waitFor(() => expect(prompt(container)).toBeNull());

    writeThenLeave(editor, sceneId);
    await act(async () => {});
    expect(prompt(container)).toBeNull();
  });

  it("Esc ＝ 現在別煩我：什麼都不記，下次離開那一句還會再問", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
    const before = editor.state.doc.toJSON();

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(editor.state.doc.toJSON()).toEqual(before);

    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
  });

  it("點到別處也收起 —— 同樣不記錄", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([]);
  });
});

describe("鍵盤", () => {
  const key = (editor: Editor, k: string) => fireEvent.keyDown(editor.view.dom, { key: k });
  const lit = (root: HTMLElement) =>
    [...(prompt(root)?.querySelectorAll("li.is-active") ?? [])].map((li) => li.textContent ?? "");

  it("沒有預選：選單出現時沒有任何一列亮著", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    expect(lit(container)).toEqual([]);
  });

  it("↓ 亮起第一列、再 ↓ 換到下一列；↑ 從沒亮的狀態亮起最後一列", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
    const caret = editor.state.selection.from;

    key(editor, "ArrowDown");
    await waitFor(() => expect(lit(container)).toEqual(["＋ 新增為登場人物"]));
    key(editor, "ArrowDown");
    await waitFor(() => expect(lit(container)).toEqual(["✕ 不新增 —— 他不入鏡"]));
    // ↑↓ 歸選單：游標沒被移走。
    expect(editor.state.selection.from).toBe(caret);

    key(editor, "Escape");
    await waitFor(() => expect(prompt(container)).toBeNull());
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
    key(editor, "ArrowUp");
    await waitFor(() => expect(lit(container)).toEqual(["✕ 不新增 —— 他不入鏡"]));
  });

  it("Enter 打在亮起的那一列上 ＝ 選它；游標不動", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());
    caretInto(editor, sceneId, 1, "start");
    const caret = editor.state.selection.from;

    key(editor, "ArrowDown");
    await waitFor(() => expect(lit(container)).toEqual(["＋ 新增為登場人物"]));
    key(editor, "Enter");

    await waitFor(() =>
      expect(sceneAppearingCharacters(sceneAttrs(editor).appearingCharacters)).toEqual([
        { characterId: xiaoming, displayName: "小明" },
      ]),
    );
    await waitFor(() => expect(prompt(container)).toBeNull());
    expect(editor.state.selection.from).toBe(caret);
  });

  it("沒亮任何一列時 Enter 屬於內文 —— 順手一個 Enter 不會替他做決定", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    key(editor, "Enter");

    await act(async () => {});
    expect(sceneAttrs(editor).appearingCharacters).toBeNull();
    expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([]);
  });
});

describe("可以完全忽略", () => {
  it("選單開著時照樣打字 —— 字落在他寫的地方，選單不收也不搶", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    act(() => {
      editor.commands.insertContent("，大家拍手");
    });

    expect(editor.state.doc.child(0).child(1).textContent).toBe("他吹熄蠟燭，大家拍手");
    expect(prompt(container)).not.toBeNull();
    // 不回答就什麼都沒寫進去。
    expect(sceneAttrs(editor).appearingCharacters).toBeNull();
    expect(sceneAttrs(editor).dismissedCharacterIds).toEqual([]);
  });

  it("編劇自己在 chip row 補上了 → 落差不在了，選單自己收起", async () => {
    const { sceneId, doc } = sceneDoc();
    const { container, editor } = await mount(doc);
    writeThenLeave(editor, sceneId);
    await waitFor(() => expect(prompt(container)).not.toBeNull());

    act(() => {
      editor.commands.command(({ tr }) => {
        tr.setNodeAttribute(0, "appearingCharacters", [
          { characterId: xiaoming, displayName: "小明" },
        ]);
        return true;
      });
    });

    await waitFor(() => expect(prompt(container)).toBeNull());
  });
});
