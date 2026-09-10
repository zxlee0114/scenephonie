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

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithDialogue() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("dialogue", null, [kernelSchema.text("生日快樂")]),
      ]),
    ])
    .toJSON() as object;
}

function Harness({ onEditor }: { onEditor?: (e: Editor) => void }) {
  const editor = useScreenplayEditor(docWithDialogue());
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
});
