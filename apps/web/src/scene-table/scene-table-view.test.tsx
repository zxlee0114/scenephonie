// @vitest-environment jsdom
/**
 * 劇本 ↔ 場次表（票券 15，§7.10）：同一份劇本的另一種讀法。場次表讀的是**記憶體裡的 doc**
 * （編輯器沒有卸載），所以剛打的字不必等存檔；列點擊依 `sceneId` 跳回編輯器，重排場次也不跳錯；
 * 切換時以游標所在場次對位。推導規則本身在 kernel 測（`scene-table.test.ts`）。
 */
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintCharacterId,
  mintLocationId,
  mintSceneId,
  moveScene,
  schema as k,
} from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScreenplayEditor, type ScreenplayView as View } from "@/editor/ScreenplayEditor";
import { runKernelCommand } from "@/editor/command-bridge";

const kitchen = { id: mintLocationId(), name: "海豚公寓廚房" };
const ming = { id: mintCharacterId(), name: "小明" };

const action = (text: string) => k.node("action", null, [k.text(text)]);
const filled = (attrs: Record<string, unknown> = {}) => ({
  time: "日",
  intExt: "內景",
  location: { locationId: kitchen.id, displayName: "廚房" },
  ...attrs,
});
const scene = (text: string, attrs: Record<string, unknown> = filled(), extra: PMNode[] = []) =>
  k.node("scene", { sceneId: mintSceneId(), ...attrs }, [action(text), ...extra]);
const sub = (text: string) =>
  k.node("subscene", { sceneId: mintSceneId(), kind: "插入", ...filled({ time: "夜" }) }, [action(text)]);

function mount(doc: PMNode, view: View = "script") {
  const onShowScript = vi.fn();
  const props = {
    initialContent: doc.toJSON() as object,
    initialFocus: "documentEnd" as const,
    entities: { characters: [ming], locations: [kitchen] },
    onShowScript,
  };
  const utils = render(<ScreenplayEditor {...props} view={view} />);
  const show = (next: View) => act(async () => utils.rerender(<ScreenplayEditor {...props} view={next} />));
  return { ...utils, onShowScript, show };
}

async function ready(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return (container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor }).editor;
}

/** 表上每一列印出來的六格。 */
const tableRows = (container: HTMLElement) =>
  [...container.querySelectorAll(".scene-table tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent),
  );

/** 游標所在的場次（DOM selection 落在哪個 `data-scene-id` 裡）。 */
const caretScene = () =>
  (window.getSelection()?.anchorNode as Node | null)?.parentElement?.closest("[data-scene-id]")?.getAttribute(
    "data-scene-id",
  );

describe("場次表檢視", () => {
  afterEach(() => cleanup());

  it("只列正式場次；地點與人物印 `實體名（這一場的顯示名）`", async () => {
    const doc = k.node("doc", null, [
      scene("煮麵", filled({ appearingCharacters: [{ characterId: ming.id, displayName: "男子" }] }), [
        sub("回憶"),
      ]),
      scene("草稿", filled({ manualDraft: true })),
      scene("吃麵"),
    ]);
    const { container } = mount(doc, "table");
    await ready(container);

    expect(tableRows(container)).toEqual([
      ["1", "內景", "日", "海豚公寓廚房（廚房）", "小明（男子）", ""],
      ["1.1", "內景", "夜", "海豚公寓廚房（廚房）", "", ""],
      ["2", "內景", "日", "海豚公寓廚房（廚房）", "", ""],
    ]);
  });

  it("切到場次表時讀的是記憶體裡的 doc —— 剛改的不必等存檔", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("吃麵")]);
    const { container, show } = mount(doc);
    const editor = await ready(container);

    const second = doc.child(1).attrs.sceneId as string;
    act(() => {
      runKernelCommand(editor, (d) => moveScene(d, { sceneId: second, target: { position: "start" } }));
    });
    await show("table");

    expect(container.querySelector(".scene-table")).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".screenplay-page")!.hidden).toBe(true);
    expect(container.querySelector(`.scene-table tr[data-scene-id="${second}"] td`)!.textContent).toBe("1");
  });

  it("點一列：回到劇本，游標落進那一場 —— 依 sceneId，重排過也不跳錯", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("洗碗", filled(), [sub("回憶")]), scene("吃麵")]);
    const { container, onShowScript, show } = mount(doc);
    const editor = await ready(container);

    const target = doc.child(1).attrs.sceneId as string;
    act(() => {
      runKernelCommand(editor, (d) => moveScene(d, { sceneId: target, target: { position: "end" } }));
    });
    await show("table");
    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${target}"]`)!);
    expect(onShowScript).toHaveBeenCalledTimes(1);
    await show("script");

    await waitFor(() => expect(caretScene()).toBe(target));
    expect(editor.state.selection.$from.parent.textContent).toBe("洗碗");
  });

  it("點子場次那一列，游標落進子場次", async () => {
    const inserted = sub("回憶");
    const doc = k.node("doc", null, [scene("洗碗", filled(), [inserted]), scene("吃麵")]);
    const { container, show } = mount(doc, "table");
    const editor = await ready(container);

    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${inserted.attrs.sceneId}"]`)!);
    await show("script");

    await waitFor(() => expect(editor.state.selection.$from.parent.textContent).toBe("回憶"));
  });

  it("切到場次表時，以游標所在的場次對位", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("吃麵")]);
    const { container, show } = mount(doc);
    await ready(container); // documentEnd：游標在最後一場
    await show("table");

    const current = container.querySelector('.scene-table tr[aria-current="location"]');
    expect(current?.getAttribute("data-scene-id")).toBe(doc.child(1).attrs.sceneId);
  });

  it("游標在草稿裡（草稿不進表）：對位到它前面最近的一列", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("吃麵"), scene("想一想", filled({ manualDraft: true }))]);
    const { container, show } = mount(doc);
    await ready(container);
    await show("table");

    const current = container.querySelector('.scene-table tr[aria-current="location"]');
    expect(current?.getAttribute("data-scene-id")).toBe(doc.child(1).attrs.sceneId);
  });

  it("搜尋框篩選表上的列", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("吃麵", filled({ time: "夜" }))]);
    const { container } = mount(doc, "table");
    await ready(container);

    fireEvent.change(container.querySelector(".scene-table__search")!, { target: { value: "夜" } });
    expect(tableRows(container).map((r) => r[0])).toEqual(["2"]);
  });
});
