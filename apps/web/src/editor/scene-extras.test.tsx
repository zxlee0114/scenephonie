// @vitest-environment jsdom
/**
 * 群演在編輯器裡的驗收（票券 09）。
 *
 * 兩個入口，**都不走 `/` 選單**（否決 `/extra`、`/crowd` —— 群演是 metadata 欄位而非區塊）：
 * 內嵌簡表的群演欄，與對白人物欄的自動補全（可在那裡直接新建一筆）。
 *
 * 分界規則由編劇宣告：**一個人說話 → 人物**（即使名字只是「路人甲」），**一群人齊聲說 → 群演**。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintExtraId, mintSceneId, sceneExtras, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const scene = (attrs: Record<string, unknown>, blocks: unknown[]) =>
  kernelSchema.node("scene", { sceneId: mintSceneId(), ...attrs }, blocks as never);

function docJSON(...scenes: unknown[]) {
  return kernelSchema.node("doc", null, scenes as never).toJSON() as object;
}

function Harness({ doc, onEditor }: { doc: object; onEditor?: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor?.(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

const chipTexts = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((chip) => {
    const clone = chip.cloneNode(true) as HTMLElement;
    clone.querySelector(".entity-chip__remove")?.remove();
    clone.querySelector(".entity-chip__mark")?.remove();
    return clone.textContent?.trim() ?? "";
  });

const extrasChips = (root: HTMLElement) => chipTexts(root, ".scene__chip--extras .entity-chip");
const speakerChips = (root: HTMLElement) => chipTexts(root, ".block__speaker-field .entity-chip");
const appearingChips = (root: HTMLElement) =>
  chipTexts(root, ".scene__chip--character .entity-chip");

const menuRows = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(`${selector} .entity-field__menu li`)].map((li) => li.textContent ?? "");

const inputIn = (container: HTMLElement, selector: string) =>
  waitFor(() => {
    const el = container.querySelector<HTMLInputElement>(`${selector} input`);
    expect(el).not.toBeNull();
    return el!;
  });

const extrasOf = (editor: Editor) => sceneExtras(editor.state.doc.firstChild!.attrs.extras);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("簡表的群演欄", () => {
  it("多組「描述 x 人數」寫進場次的 extras", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={docJSON(scene({}, [kernelSchema.node("action", null, [kernelSchema.text("走進咖啡廳")])]))}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await inputIn(container, ".scene__chip--extras");

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8、服務生 x2、" } });

    await waitFor(() => expect(extrasChips(container)).toEqual(["咖啡廳客人 x8", "服務生 x2"]));
    expect(extrasOf(editor).map((e) => [e.description, e.count])).toEqual([
      ["咖啡廳客人", 8],
      ["服務生", 2],
    ]);
    // 群演不進登場人物欄 —— 那一欄的判準是入鏡的**人物**。
    expect(appearingChips(container)).toEqual([]);
  });

  it("別場用過的描述**只補字串**：選它只是把字填進框裡，沒有任何 id 被共用", async () => {
    let editor!: Editor;
    const elsewhere = scene({ extras: [{ extraId: mintExtraId(), description: "咖啡廳客人", count: 8 }] }, [
      kernelSchema.node("action", null, [kernelSchema.text("別場")]),
    ]);
    const here = scene({}, [kernelSchema.node("action", null, [kernelSchema.text("這一場")])]);
    const { container } = render(
      <Harness doc={docJSON(elsewhere, here)} onEditor={(e) => (editor = e)} />,
    );
    const input = (await waitFor(() => {
      const all = container.querySelectorAll<HTMLInputElement>(".scene__chip--extras input");
      expect(all).toHaveLength(2);
      return all;
    }))[1]!;

    fireEvent.change(input, { target: { value: "咖啡" } });
    await waitFor(() =>
      expect(menuRows(container, ".scene__chip--extras")).toContain("👥 咖啡廳客人"),
    );
    fireEvent.mouseDown(
      [...container.querySelectorAll(".scene__chip--extras .entity-field__menu li")].at(-1)!,
    );

    await waitFor(() => expect(input.value).toBe("咖啡廳客人"));
    fireEvent.change(input, { target: { value: "咖啡廳客人 x5" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(sceneExtras(editor.state.doc.child(1).attrs.extras)).toHaveLength(1));
    const [first] = sceneExtras(editor.state.doc.child(0).attrs.extras);
    const [second] = sceneExtras(editor.state.doc.child(1).attrs.extras);
    // 同一串描述、**不同的 id** —— 兩場之間沒有「這是同一批人」的承諾。
    expect(second!.description).toBe("咖啡廳客人");
    expect(second!.extraId).not.toBe(first!.extraId);
  });
});

describe("對白人物欄：一人說話落人物、一群齊聲落群演", () => {
  const dialogueScene = () =>
    docJSON(scene({}, [kernelSchema.node("dialogue", null, [kernelSchema.text("喔——")])]));

  it("兩條路並排在同一份選單裡，由編劇挑（系統不推導）", async () => {
    const { container } = render(<Harness doc={dialogueScene()} />);
    const input = await inputIn(container, ".block__speaker-field");

    fireEvent.change(input, { target: { value: "眾人 x20" } });

    await waitFor(() =>
      expect(menuRows(container, ".block__speaker-field")).toEqual([
        "＋ 建立新實體「眾人 x20」",
        "👥 新增群演「眾人」20 人",
      ]),
    );
  });

  it("挑群演那一列 → 一筆本場群演 ＋ 一個指向它的引用，**同一個 transaction**", async () => {
    let editor!: Editor;
    const { container } = render(<Harness doc={dialogueScene()} onEditor={(e) => (editor = e)} />);
    const input = await inputIn(container, ".block__speaker-field");

    fireEvent.change(input, { target: { value: "眾人 x20" } });
    await waitFor(() => expect(menuRows(container, ".block__speaker-field")).toHaveLength(2));
    fireEvent.mouseDown(
      [...container.querySelectorAll(".block__speaker-field .entity-field__menu li")].at(-1)!,
    );

    await waitFor(() => expect(extrasOf(editor)).toHaveLength(1));
    const [extra] = extrasOf(editor);
    expect(extra).toMatchObject({ description: "眾人", count: 20 });
    expect(editor.state.doc.firstChild!.child(0).attrs.character).toEqual({
      id: extra!.extraId,
      displayName: "眾人",
    });
    // 群演不是人物：登場人物欄一個字都沒多（那一欄的判準是入鏡的人物）。
    expect(appearingChips(container)).toEqual([]);
    expect(editor.state.doc.firstChild!.attrs.appearingCharacters).toBeNull();

    // 編劇眼中那是一個動作 —— ⌘Z 一次就回到原狀。
    editor.commands.undo();
    await waitFor(() => expect(extrasOf(editor)).toHaveLength(0));
    expect(editor.state.doc.firstChild!.child(0).attrs.character).toBeNull();
  });

  it("本場既有的群演出現在自動補全，別場的不出現（id 只在該場次內有意義）", async () => {
    const guests = mintExtraId();
    const waiters = mintExtraId();
    const here = scene({ extras: [{ extraId: guests, description: "咖啡廳客人", count: 8 }] }, [
      kernelSchema.node("dialogue", null, [kernelSchema.text("喔——")]),
    ]);
    const elsewhere = scene({ extras: [{ extraId: waiters, description: "咖啡廳服務生", count: 2 }] }, [
      kernelSchema.node("action", null, [kernelSchema.text("別場")]),
    ]);
    const { container } = render(<Harness doc={docJSON(here, elsewhere)} />);
    const input = await inputIn(container, ".block__speaker-field");

    fireEvent.change(input, { target: { value: "咖啡廳" } });

    await waitFor(() => {
      const rows = menuRows(container, ".block__speaker-field");
      expect(rows).toContain("👥 咖啡廳客人");
      expect(rows).not.toContain("👥 咖啡廳服務生");
    });
  });

  it("改群演 chip 上的字 → 改的是「這一場顯示的名字」，不會變成一筆人物", async () => {
    let editor!: Editor;
    const extraId = mintExtraId();
    const here = scene({ extras: [{ extraId, description: "咖啡廳客人", count: 8 }] }, [
      kernelSchema.node("dialogue", { character: { id: extraId, displayName: "咖啡廳客人" } }, [
        kernelSchema.text("喔——"),
      ]),
    ]);
    const { container } = render(<Harness doc={docJSON(here)} onEditor={(e) => (editor = e)} />);
    const input = await inputIn(container, ".block__speaker-field");

    fireEvent.mouseDown(container.querySelector(".block__speaker-field .entity-chip")!);
    await waitFor(() => expect(input.value).toBe("咖啡廳客人"));
    fireEvent.change(input, { target: { value: "眾人" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(editor.state.doc.firstChild!.child(0).attrs.character).toEqual({
        id: extraId,
        displayName: "眾人",
      }),
    );
    // 一群齊聲說仍然是群演 —— 改一個字不該替編劇把它翻成人物。
    expect(extrasOf(editor)).toHaveLength(1);
  });

  it("一個人說話就是人物 —— 即使他只叫「路人甲」", async () => {
    let editor!: Editor;
    const { container } = render(<Harness doc={dialogueScene()} onEditor={(e) => (editor = e)} />);
    const input = await inputIn(container, ".block__speaker-field");

    fireEvent.change(input, { target: { value: "路人甲" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(speakerChips(container)).toEqual(["路人甲"]));
    expect(extrasOf(editor)).toEqual([]); // 沒有任何群演被建出來
    const speaker = editor.state.doc.firstChild!.child(0).attrs.character as { id: string };
    expect(speaker.id.startsWith("ch_")).toBe(true);
  });
});
