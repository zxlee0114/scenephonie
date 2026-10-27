// @vitest-environment jsdom
/**
 * 對白的人物欄（使用者裁決 2026-09-10）。
 *
 * **① 多值**：多個具名角色可以同時說一句台詞（齊聲）。attr 的形狀因此與地點欄同一套
 * （單值 ｜ 陣列 ｜ null），舊稿裡的單值物件照樣讀得出來。
 *
 * **② 在這一欄新建的人物不會被掛進登場人物欄。** 票券 08 曾經暫時這麼做（那時「有台詞」與
 * 「入鏡」被當成同一件事），票券 10 拆掉：判準是入鏡，系統絕不從對白推導（§4.7）。落差由
 * 離開那一句時的提示指出來（`appearing-prompt.test.tsx`），決定權在編劇手上。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { mintCharacterId, mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { isBlankBlock } from "./block-types";
import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithDialogue(line: string) {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("dialogue", null, line ? [kernelSchema.text(line)] : []),
      ]),
    ])
    .toJSON() as object;
}

function Harness({ onEditor, line = "生日快樂" }: { onEditor?: (e: Editor) => void; line?: string }) {
  const editor = useScreenplayEditor(docWithDialogue(line));
  useEffect(() => {
    if (editor) onEditor?.(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

const texts = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((chip) => {
    const clone = chip.cloneNode(true) as HTMLElement;
    clone.querySelector(".entity-chip__remove")?.remove();
    clone.querySelector(".entity-chip__mark")?.remove();
    return clone.textContent?.trim() ?? "";
  });

const speakers = (root: HTMLElement) => texts(root, ".block__speaker-field .entity-chip");
const appearing = (root: HTMLElement) => texts(root, ".scene__chip--character .entity-chip");

async function speakerInput(container: HTMLElement) {
  return waitFor(() => {
    const el = container.querySelector<HTMLInputElement>(".block__speaker-field input");
    expect(el).not.toBeNull();
    return el!;
  });
}

describe("對白的人物欄", () => {
  afterEach(() => {
    cleanup();
  });

  it("齊聲：頓號切成兩個人物，兩個都留得下", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "小明、小華" } });
    await waitFor(() => expect(speakers(container)).toHaveLength(1));
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(speakers(container)).toEqual(["小明", "小華"]));
    // attr 變成陣列（單值時仍是一個物件 —— 舊稿不必遷移）。
    const dialogue = editor.state.doc.firstChild!.child(0);
    expect(Array.isArray(dialogue.attrs.character)).toBe(true);
  });

  it("在這一欄新建的人物**不**掛進登場人物欄 —— 推導不替編劇決定誰入鏡", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "小明、小華" } });
    await waitFor(() => expect(speakers(container)).toHaveLength(1));
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(speakers(container)).toEqual(["小明", "小華"]));
    expect(appearing(container)).toEqual([]);
    expect(editor.state.doc.firstChild!.attrs.appearingCharacters).toBeNull();
  });

  it("填好人物、台詞還空著時按 Enter —— 對白不該被當成空區塊取消掉", async () => {
    // `isBlankBlock` 一度直接讀 `character.displayName`：attr 變成陣列之後那是 undefined，
    // 於是「人物名也空」成立，剛填好的人物連同整個對白一起被退回動作（使用者回報 2026-09-10）。
    let editor!: Editor;
    const { container } = render(<Harness line="" onEditor={(e) => (editor = e)} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "小明" } });
    fireEvent.keyDown(input, { key: "Enter" }); // 定案人物
    await waitFor(() => expect(speakers(container)).toEqual(["小明"]));

    fireEvent.keyDown(input, { key: "Enter" }); // 再一次 —— 這一下該是「進台詞」

    await waitFor(() => expect(speakers(container)).toEqual(["小明"]));
    expect(editor.state.doc.firstChild!.child(0).type.name).toBe("dialogue");
  });
});

describe("isBlankBlock 與人物欄的形狀", () => {
  const dialogueWith = (character: unknown, line: string) =>
    kernelSchema.node("dialogue", { character }, line ? [kernelSchema.text(line)] : []);

  it("台詞空、人物也空 ＝ 空區塊（Enter 可以取消型別）", () => {
    expect(isBlankBlock(dialogueWith(null, ""))).toBe(true);
  });

  it("單值人物：不算空", () => {
    expect(isBlankBlock(dialogueWith({ id: "ch_1", displayName: "小明" }, ""))).toBe(false);
  });

  it("齊聲（陣列）：一樣不算空 —— 直接讀 character.displayName 會讀成 undefined", () => {
    const both = [
      { id: "ch_1", displayName: "小明" },
      { id: "ch_2", displayName: "小華" },
    ];
    expect(isBlankBlock(dialogueWith(both, ""))).toBe(false);
  });
});

/**
 * 票券 62：空的人物欄與台詞開頭是**同一個位置**。Backspace 從人物欄這一側按，結果與台詞開頭
 * 按的一樣（文件那一半的規則與測試在 `keyboard-feedback.test.ts`、`extensions/block-join`）。
 */
describe("人物欄與台詞開頭的 Backspace（票券 62）", () => {
  afterEach(() => {
    cleanup();
  });

  const xiaoming = mintCharacterId();
  const xiaohua = mintCharacterId();

  function BlocksHarness({ blocks, onEditor }: { blocks: PMNode[]; onEditor: (e: Editor) => void }) {
    const editor = useScreenplayEditor(
      kernelSchema.node("doc", null, [kernelSchema.node("scene", { sceneId: mintSceneId() }, blocks)]).toJSON() as object,
    );
    useEffect(() => {
      if (editor) onEditor(editor);
    }, [editor, onEditor]);
    return (
      <EntityCatalogProvider
        initial={{
          characters: [
            { id: xiaoming, name: "小明" },
            { id: xiaohua, name: "小華" },
          ],
          locations: [],
        }}
      >
        <EditorContent editor={editor} />
      </EntityCatalogProvider>
    );
  }

  async function mount(blocks: PMNode[]) {
    let editor: Editor | null = null;
    const view = render(<BlocksHarness blocks={blocks} onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).not.toBeNull());
    await waitFor(() => expect(view.container.querySelector(".block__speaker-field input")).not.toBeNull());
    return { ...view, editor: editor! };
  }

  const blockTypes = (editor: Editor) => {
    const types: string[] = [];
    editor.state.doc.child(0).forEach((b) => types.push(b.type.name));
    return types;
  };

  it("空對白：人物欄空輸入框按 ⌫ → 整句拿掉，游標回上一個區塊的文字尾端", async () => {
    const { container, editor } = await mount([
      kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
      kernelSchema.node("dialogue"),
    ]);
    const input = container.querySelector<HTMLInputElement>(".block__speaker-field input")!;
    input.focus();

    act(() => {
      fireEvent.keyDown(input, { key: "Backspace" });
    });

    expect(blockTypes(editor)).toEqual(["action"]);
    const { $from } = editor.state.selection;
    expect([$from.parent.textContent, $from.parentOffset]).toEqual(["門開了", 3]);
    expect(document.activeElement).toBe(editor.view.dom);
  });

  const speakerInputOf = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>(".block__speaker-field input")!;

  /** 游標放進第 `blockIndex` 個區塊的台詞開頭，焦點在文件上，按一顆鍵。 */
  function pressAtLineStart(editor: Editor, blockIndex: number, key: string) {
    act(() => {
      let pos = 2;
      for (let i = 0; i < blockIndex; i++) pos += editor.state.doc.child(0).child(i).nodeSize;
      editor.commands.setTextSelection(pos);
      editor.view.focus();
      fireEvent.keyDown(editor.view.dom, { key });
    });
  }

  it("有人物的對白在台詞開頭按 ⌫ → 走進人物欄、拿起最後一顆（整串反白），台詞不動", async () => {
    const { container, editor } = await mount([
      kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
      kernelSchema.node("dialogue", { character: { id: xiaoming, displayName: "小明" } }, [kernelSchema.text("我是龍")]),
    ]);

    pressAtLineStart(editor, 1, "Backspace");

    const input = speakerInputOf(container);
    await waitFor(() => expect(input.value).toBe("小明"));
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2]);
    expect(speakers(container)).toEqual([]);
    expect(blockTypes(editor)).toEqual(["action", "dialogue"]);
    expect(editor.state.doc.child(0).child(1).textContent).toBe("我是龍");
  });

  it("齊聲：一顆一顆拆 —— 拿起、清空、放手，再拿下一顆；拆光之後才併回上一個區塊", async () => {
    const { container, editor } = await mount([
      kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
      kernelSchema.node(
        "dialogue",
        {
          character: [
            { id: xiaoming, displayName: "小明" },
            { id: xiaohua, displayName: "小華" },
          ],
        },
        [kernelSchema.text("走吧")],
      ),
    ]);
    const input = () => speakerInputOf(container);
    const backspace = () => act(() => void fireEvent.keyDown(input(), { key: "Backspace" }));
    const clear = () => act(() => void fireEvent.change(input(), { target: { value: "" } }));

    pressAtLineStart(editor, 1, "Backspace");
    await waitFor(() => expect(input().value).toBe("小華"));
    expect(speakers(container)).toEqual(["小明"]);

    clear();
    backspace(); // 放手
    await waitFor(() => expect(input().value).toBe(""));
    expect(speakers(container)).toEqual(["小明"]);
    backspace(); // 拿起小明
    await waitFor(() => expect(input().value).toBe("小明"));
    clear();
    backspace(); // 放手 —— 人物欄空了
    await waitFor(() => expect(speakers(container)).toEqual([]));
    expect(blockTypes(editor)).toEqual(["action", "dialogue"]);

    backspace(); // 沒人物、有台詞 → 併回上一個區塊

    expect(blockTypes(editor)).toEqual(["action"]);
    expect(editor.state.doc.child(0).child(0).textContent).toBe("門開了走吧");
  });

  it("台詞開頭按 Enter → 上方插一句空對白，焦點在它的人物欄；原句的人物 chip 留在原句", async () => {
    const { container, editor } = await mount([
      kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
      kernelSchema.node("dialogue", { character: { id: xiaoming, displayName: "小明" } }, [kernelSchema.text("我是龍")]),
    ]);

    pressAtLineStart(editor, 1, "Enter");

    await waitFor(() => expect(container.querySelectorAll(".block--dialogue")).toHaveLength(2));
    const [upper, lower] = [...container.querySelectorAll<HTMLElement>(".block--dialogue")];
    await waitFor(() => expect(document.activeElement).toBe(upper!.querySelector(".block__speaker-field input")));
    expect(speakers(upper!)).toEqual([]);
    expect(speakers(lower!)).toEqual(["小明"]);
  });
});
