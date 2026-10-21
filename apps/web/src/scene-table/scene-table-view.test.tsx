// @vitest-environment jsdom
/**
 * 劇本 ↔ 場次表（票券 15，§7.10）：同一份劇本的另一種讀法。場次表讀的是**記憶體裡的 doc**
 * （編輯器沒有卸載），所以剛打的字不必等存檔；點一列先開這一場的預覽（點錯了關掉就好），預覽裡
 * 的按鈕才依 `sceneId` 跳回編輯器，重排場次也不跳錯；切換時以游標所在場次對位。推導規則本身在 kernel 測（`scene-table.test.ts`）。
 */
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintCharacterId,
  mintGroupId,
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
const line = (text: string, attrs: Record<string, unknown> = {}) =>
  k.node("dialogue", { character: { id: ming.id, displayName: "男子" }, ...attrs }, [k.text(text)]);

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

const preview = () => document.querySelector<HTMLElement>('[role="dialog"].scene-preview');
const button = (name: string) =>
  [...preview()!.querySelectorAll("button")].find((b) => b.textContent?.includes(name))!;

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

  it("點一列只開這一場的預覽，不離開場次表；關掉就回到表上", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("吃麵")]);
    const { container, onShowScript } = mount(doc, "table");
    await ready(container);

    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${doc.child(1).attrs.sceneId}"]`)!);
    expect(preview()?.textContent).toContain("吃麵");
    expect(onShowScript).not.toHaveBeenCalled();
    // 開著的時候底下的頁面不跟著滾輪捲。
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent.click(button("關閉"));
    expect(preview()).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    // 用滑鼠點開的也一樣：焦點回到剛才那一列，Tab 從那裡接著走。
    expect(document.activeElement?.closest("tr")?.getAttribute("data-scene-id")).toBe(doc.child(1).attrs.sceneId);

    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${doc.child(0).attrs.sceneId}"]`)!);
    fireEvent.keyDown(preview()!, { key: "Escape" });
    expect(preview()).toBeNull();
    expect(onShowScript).not.toHaveBeenCalled();
  });

  it("預覽印出這一場的內文：動作、對白（說話者用這一場的叫法）、子場次", async () => {
    const doc = k.node("doc", null, [
      scene("小明煮麵", filled(), [line("好餓", { voiceStyle: "O.S." }), sub("回憶媽媽煮麵"), action("麵煮好了")]),
    ]);
    const { container } = mount(doc, "table");
    await ready(container);

    fireEvent.click(container.querySelector(".scene-table tbody tr")!);
    const text = preview()!.textContent;
    for (const piece of ["小明煮麵", "男子", "O.S.", "好餓", "1.1", "插入", "回憶媽媽煮麵", "麵煮好了"]) {
      expect(text).toContain(piece);
    }
    expect(text.indexOf("回憶媽媽煮麵")).toBeLessThan(text.indexOf("麵煮好了"));
  });

  it("群組成員的預覽只印它自己的片段", async () => {
    const a = k.node("groupMember", { sceneId: mintSceneId(), ...filled() });
    const b = k.node("groupMember", { sceneId: mintSceneId(), ...filled({ time: "夜" }) });
    const fragment = (m: PMNode, text: string) =>
      k.node("groupFragment", { memberId: m.attrs.sceneId as string }, [action(text)]);
    const doc = k.node("doc", null, [
      k.node("sceneGroup", { groupId: mintGroupId() }, [a, b, fragment(a, "甲打電話"), fragment(b, "乙接電話"), fragment(a, "甲掛斷")]),
    ]);
    const { container } = mount(doc, "table");
    await ready(container);

    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${a.attrs.sceneId}"]`)!);
    const text = preview()!.textContent;
    expect(text).toContain("甲打電話");
    expect(text).toContain("甲掛斷");
    expect(text).not.toContain("乙接電話");
  });

  it("預覽裡的「到劇本」：回到劇本，游標落進那一場 —— 依 sceneId，重排過也不跳錯", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("洗碗", filled(), [sub("回憶")]), scene("吃麵")]);
    const { container, onShowScript, show } = mount(doc);
    const editor = await ready(container);

    const target = doc.child(1).attrs.sceneId as string;
    act(() => {
      runKernelCommand(editor, (d) => moveScene(d, { sceneId: target, target: { position: "end" } }));
    });
    await show("table");
    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${target}"]`)!);
    fireEvent.click(button("到劇本"));
    expect(onShowScript).toHaveBeenCalledTimes(1);
    await show("script");

    await waitFor(() => expect(caretScene()).toBe(target));
    expect(editor.state.selection.$from.parent.textContent).toBe("洗碗");
    // 落點短暫浮現底色（同「新增下一場」），讓眼睛知道跳到了哪裡。
    expect(container.querySelector(`.scene[data-scene-id="${target}"]`)!.hasAttribute("data-just-revealed")).toBe(true);
  });

  it("子場次那一列的「到劇本」，游標落進子場次", async () => {
    const inserted = sub("回憶");
    const doc = k.node("doc", null, [scene("洗碗", filled(), [inserted]), scene("吃麵")]);
    const { container, show } = mount(doc, "table");
    const editor = await ready(container);

    fireEvent.click(container.querySelector(`.scene-table tr[data-scene-id="${inserted.attrs.sceneId}"]`)!);
    fireEvent.click(button("到劇本"));
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
