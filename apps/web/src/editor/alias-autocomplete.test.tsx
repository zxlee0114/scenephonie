// @vitest-environment jsdom
/**
 * 自動補全認得別場用過的叫法（票券 79）—— 接線那一層：場次抬頭的人物欄與對白人物欄都從 doc 查別名。
 *
 * 列怎麼印、怎麼排在 `entity-field.test.tsx`；這裡只釘「兩個呼叫端都把 `aliasIndex` 接上了」。
 * 起點是票券 21 驗收撈到的那一份 doc：第 1 場的對白印「我是誰」，指向的實體叫「我是龍」。
 */
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const dragon = { id: "ch_dragon", name: "我是龍" };

const doc = kernelSchema
  .node("doc", null, [
    kernelSchema.node("scene", { sceneId: mintSceneId() }, [
      kernelSchema.node("dialogue", { character: { id: dragon.id, displayName: "我是誰" } }, [
        kernelSchema.text("你認得我嗎"),
      ]),
    ]),
    kernelSchema.node("scene", { sceneId: mintSceneId() }, [
      kernelSchema.node("dialogue", null, [kernelSchema.text("認得")]),
    ]),
  ])
  .toJSON() as object;

function Harness() {
  const editor = useScreenplayEditor(doc);
  return (
    <EntityCatalogProvider initial={{ characters: [dragon], locations: [] }}>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

const secondScene = (container: HTMLElement) =>
  waitFor(() => {
    const scenes = container.querySelectorAll<HTMLElement>(".scene");
    expect(scenes.length).toBe(2);
    return scenes[1]!;
  });

const firstRow = (root: HTMLElement, field: string) =>
  root.querySelector(`${field} .entity-field__menu li:not(.entity-field__menu-hint)`)?.textContent;

afterEach(() => {
  cleanup();
});

describe("別場的叫法在兩個人物欄都命中（票券 79）", () => {
  it("對白人物欄", async () => {
    const { container } = render(<Harness />);
    const scene = await secondScene(container);
    const input = scene.querySelector<HTMLInputElement>(".block__speaker-field input")!;

    fireEvent.change(input, { target: { value: "我是誰" } });

    expect(firstRow(scene, ".block__speaker-field")).toBe("👤 我是誰（為「我是龍」的別名，1 場）");
  });

  it("登場人物欄", async () => {
    const { container } = render(<Harness />);
    const scene = await secondScene(container);
    const input = scene.querySelector<HTMLInputElement>(".scene__chip--character input")!;

    fireEvent.change(input, { target: { value: "我是誰" } });

    expect(firstRow(scene, ".scene__chip--character")).toBe("👤 我是誰（為「我是龍」的別名，1 場）");
  });
});
