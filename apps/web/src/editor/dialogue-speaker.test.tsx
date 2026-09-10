// @vitest-environment jsdom
/**
 * 對白的人物欄（使用者裁決 2026-09-10）。
 *
 * **① 多值**：多個具名角色可以同時說一句台詞（齊聲）。attr 的形狀因此與地點欄同一套
 * （單值 ｜ 陣列 ｜ null），舊稿裡的單值物件照樣讀得出來。
 *
 * **② 在這一欄新建的人物順手掛進本場的登場人物欄。** ⚠️ 這是**暫時**的：§4.7 的規則是
 * 「判準是入鏡，系統絕不從對白推導」，而現在推導得起來只因為 V.O./O.S. 還沒實作（票券 10）
 * —— 每一句對白都是一般發聲，「有台詞」與「入鏡」暫時同一件事。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
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
    document.body.innerHTML = "";
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

  it("在這一欄新建的人物，順手掛進本場的登場人物欄", async () => {
    const { container } = render(<Harness />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "小明" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(speakers(container)).toEqual(["小明"]));
    await waitFor(() => expect(appearing(container)).toEqual(["小明"]));
  });

  it("齊聲的兩個人都掛得上去，而且不重複掛", async () => {
    const { container } = render(<Harness />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "小明、小華" } });
    await waitFor(() => expect(speakers(container)).toHaveLength(1));
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(appearing(container)).toEqual(["小明", "小華"]));
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
