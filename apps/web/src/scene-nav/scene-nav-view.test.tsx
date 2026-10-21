// @vitest-environment jsdom
/**
 * 場次導覽 sidebar（票券 16，§7.10）：創作中的定位 —— 列出場次（含草稿）、點擊跳到該場、跟隨游標
 * 高亮、可收合且跨 reload 記得。列怎麼推導在 `rows.test.ts`，篩選規則在 `scene-table/filter.test.ts`。
 */
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mintGroupId, mintLocationId, mintSceneId, schema as k } from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenplayEditor, type ScreenplayView as View } from "@/editor/ScreenplayEditor";

const kitchen = { id: mintLocationId(), name: "海豚公寓廚房" };

const action = (text: string) => k.node("action", null, [k.text(text)]);
const filled = (attrs: Record<string, unknown> = {}) => ({
  time: "日",
  intExt: "內景",
  location: { locationId: kitchen.id, displayName: "廚房" },
  ...attrs,
});
const scene = (text: string, attrs: Record<string, unknown> = filled(), extra: PMNode[] = []) =>
  k.node("scene", { sceneId: mintSceneId(), ...attrs }, [action(text), ...extra]);

function mount(doc: PMNode, view: View = "script") {
  const props = {
    initialContent: doc.toJSON() as object,
    initialFocus: "documentEnd" as const,
    entities: { characters: [], locations: [kitchen] },
  };
  const utils = render(<ScreenplayEditor {...props} view={view} />);
  const show = (next: View) => act(async () => utils.rerender(<ScreenplayEditor {...props} view={next} />));
  return { ...utils, show };
}

async function ready(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return (container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor }).editor;
}

const nav = (container: HTMLElement) => container.querySelector<HTMLElement>('nav[aria-label="場次導覽"]');
/** sidebar 每一列看得見的字（唸給螢幕閱讀器的不算）。 */
const navRows = (container: HTMLElement) =>
  [...nav(container)!.querySelectorAll("[data-scene-id]")].map((el) => {
    const visible = el.cloneNode(true) as HTMLElement;
    visible.querySelectorAll(".sr-only").forEach((hidden) => hidden.remove());
    return visible.textContent?.replace(/\s+/g, " ").trim();
  });

describe("場次導覽 sidebar", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("列出每一場，形如 `S1 內 日 廚房`；草稿也列", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("草稿", filled({ manualDraft: true })), scene("吃麵")]);
    const { container } = mount(doc);
    await ready(container);

    expect(navRows(container)).toEqual(["S1 內 日 廚房", "S1[D1] 內 日 廚房", "S2 內 日 廚房"]);
  });

  it("草稿標示出來；子場次縮排；群組成員收在同一組裡，群組本身不佔一列", async () => {
    const a = k.node("groupMember", { sceneId: mintSceneId(), ...filled({ time: "夜" }) });
    const b = k.node("groupMember", { sceneId: mintSceneId(), ...filled({ time: "晨" }) });
    const fragment = (m: PMNode, text: string) =>
      k.node("groupFragment", { memberId: m.attrs.sceneId as string }, [action(text)]);
    const inserted = k.node("subscene", { sceneId: mintSceneId(), kind: "插入", ...filled({ time: "昏" }) }, [
      action("回憶"),
    ]);
    const draft = scene("草稿", filled({ manualDraft: true }));
    const doc = k.node("doc", null, [
      scene("煮麵", filled(), [inserted]),
      draft,
      k.node("sceneGroup", { groupId: mintGroupId() }, [a, b, fragment(a, "甲打電話"), fragment(b, "乙接電話")]),
    ]);
    const { container } = mount(doc);
    await ready(container);
    const item = (id: unknown) => nav(container)!.querySelector<HTMLElement>(`[data-scene-id="${id as string}"]`)!;

    expect(navRows(container)).toEqual(["S1 內 日 廚房", "S1.1 內 昏 廚房", "S1[D1] 內 日 廚房", "S2 內 夜 廚房", "S3 內 晨 廚房"]);
    expect(item(draft.attrs.sceneId).querySelector(".scene-nav__draft")?.textContent).toBe("草稿");
    expect(item(inserted.attrs.sceneId).classList.contains("scene-nav__item--sub")).toBe(true);
    const group = item(a.attrs.sceneId).closest('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("對剪");
    expect(group?.contains(item(b.attrs.sceneId))).toBe(true);
    expect(group?.contains(item(draft.attrs.sceneId))).toBe(false);
  });

  it("點一列：游標落進那一場，那一場浮現底色", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("洗碗"), scene("吃麵")]);
    const { container } = mount(doc);
    const editor = await ready(container);
    const target = doc.child(1).attrs.sceneId as string;

    fireEvent.click(nav(container)!.querySelector(`[data-scene-id="${target}"] button`)!);

    expect(editor.state.selection.$from.parent.textContent).toBe("洗碗");
    expect(container.querySelector(`.scene[data-scene-id="${target}"]`)!.hasAttribute("data-just-revealed")).toBe(true);
  });

  it("搜尋框篩清單：比對場次號、地點（實體名也算）、時間；清空就全部回來", async () => {
    const doc = k.node("doc", null, [
      scene("煮麵"),
      scene("下樓", filled({ time: "夜", location: { locationId: mintLocationId(), displayName: "巷口" } })),
      scene("吃麵"),
    ]);
    const { container } = mount(doc);
    await ready(container);
    const search = nav(container)!.querySelector<HTMLInputElement>('input[type="search"]')!;
    const type = (value: string) => fireEvent.change(search, { target: { value } });

    type("夜");
    expect(navRows(container)).toEqual(["S2 內 夜 巷口"]);
    type("海豚");
    expect(navRows(container)).toEqual(["S1 內 日 廚房", "S3 內 日 廚房"]);
    type("S3");
    expect(navRows(container)).toEqual(["S3 內 日 廚房"]);
    type("沒有這場");
    expect(navRows(container)).toEqual([]);
    expect(nav(container)!.textContent).toContain("沒有對得上的場次");
    type("");
    expect(navRows(container)).toHaveLength(3);
  });

  it("預設展開；收起來之後重新載入仍是收起的", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("吃麵")]);
    const first = mount(doc);
    await ready(first.container);
    const toggle = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".scene-nav__toggle")!;

    expect(toggle(first.container).getAttribute("aria-expanded")).toBe("true");
    expect(navRows(first.container)).toHaveLength(2);

    fireEvent.click(toggle(first.container));
    expect(toggle(first.container).getAttribute("aria-expanded")).toBe("false");
    expect(navRows(first.container)).toHaveLength(0);

    first.unmount();
    const again = mount(doc);
    await ready(again.container);
    expect(toggle(again.container).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle(again.container));
    expect(navRows(again.container)).toHaveLength(2);
  });

  it("只陪劇本：切到場次表時不出現", async () => {
    const doc = k.node("doc", null, [scene("煮麵")]);
    const { container, show } = mount(doc);
    await ready(container);
    expect(nav(container)).not.toBeNull();
    await show("table");
    expect(nav(container)).toBeNull();
  });

  it("高亮跟著游標所在的那一場走", async () => {
    const doc = k.node("doc", null, [scene("煮麵"), scene("洗碗"), scene("吃麵")]);
    const { container } = mount(doc);
    const editor = await ready(container);
    const current = () =>
      nav(container)!.querySelector('[aria-current="location"]')?.closest("[data-scene-id]")?.getAttribute("data-scene-id");

    // 載回既有的稿：游標在文件末端（最後一場）。
    expect(current()).toBe(doc.child(2).attrs.sceneId);

    act(() => {
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(3))));
    });
    expect(current()).toBe(doc.child(0).attrs.sceneId);
  });
});
