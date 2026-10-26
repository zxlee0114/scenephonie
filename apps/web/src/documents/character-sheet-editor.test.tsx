// @vitest-environment jsdom
/**
 * 票券 21 第 ② 片 —— 人物介紹（角色設定表）的編輯器。
 *
 * 表上每一筆是一個人物引用；名字與介紹內文是人物實體的欄位，不在表上。拖曳排序走 ProseMirror 內建、
 * jsdom 沒有版面，留給人工驗收。
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { characterSheetIds, emptyDocument } from "@scenephonie/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SaveDoc } from "@/editor/save-capability";
import type { SaveToken } from "@/persistence";

import { CharacterSheetEditor, type RenameCharacter } from "./character-sheet-editor";

const token = "st_0" as SaveToken;

const ruoqing = { id: "ch_ruoqing", name: "若晴", description: "三十歲，醫院護理師。" };
const xiaomei = { id: "ch_xiaomei", name: "小美", description: null };
/** ⌘Z 留下的孤兒：目錄裡有，但沒有任何引用指向她。 */
const orphan = { id: "ch_orphan", name: "小美的前男友", description: null };

const sheetOf = (...ids: string[]) => ({
  type: "doc",
  content: ids.map((characterId) => ({ type: "characterEntry", attrs: { characterId } })),
});

function setup({ body = sheetOf(ruoqing.id), count = 0 }: { body?: object; count?: number } = {}) {
  const capabilities = {
    save: vi.fn<SaveDoc>(async () => ({ status: "saved", token })),
    createCharacter: vi.fn(async (name: string) => ({ id: `ch_new_${name}`, name })),
    saveDescription: vi.fn<(id: string, description: string) => Promise<boolean>>(async () => true),
    rename: {
      count: vi.fn<RenameCharacter["count"]>(async () => count),
      run: vi.fn<RenameCharacter["run"]>(async () => true),
    },
  };
  const view = render(
    <CharacterSheetEditor
      initialBody={body}
      initialToken={token}
      characters={[ruoqing, xiaomei, orphan]}
      // 小美在劇本裡用了 12 場；孤兒一場都沒有。
      scenes={{ [xiaomei.id]: 12 }}
      {...capabilities}
    />,
  );
  return { ...view, ...capabilities };
}

const entries = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLInputElement>(".character-entry__name")].map((input) => input.value);
const addButton = () => screen.getByRole("button", { name: "＋ 新增人物" });
/** 按「＋ 新增人物」長出來的那一列的名字欄。 */
const draftInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>(".character-sheet__draft input");
/** 按「＋ 新增人物」，回傳長出來的名字欄。 */
const addInput = async (container: HTMLElement) => {
  fireEvent.click(await screen.findByRole("button", { name: "＋ 新增人物" }));
  return draftInput(container)!;
};
/** 某一位的介紹內文框（依表上的順序）。 */
const descriptions = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLTextAreaElement>(".character-entry__description"),
];
const menuRows = (container: HTMLElement) =>
  [...container.querySelectorAll(".character-sheet__draft .entity-field__menu li:not(.entity-field__menu-hint)")].map(
    (li) => li.textContent ?? "",
  );
/** ⌘S：立刻存，不等打字停頓的 2.5 秒（`SaveStatusLine` 接這顆鍵）。 */
const saveNow = () => fireEvent.keyDown(window, { key: "s", metaKey: true });
/** 最後一次存檔送出的表：收錄了誰。 */
const lastSaved = (save: ReturnType<typeof setup>["save"]) => characterSheetIds(save.mock.calls.at(-1)?.[0]);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("表上印的是人物實體", () => {
  it("每一筆印人物的名字與介紹內文", async () => {
    const { container } = setup();
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(screen.getByDisplayValue("三十歲，醫院護理師。")).toBeTruthy();
  });

  it("還沒收錄任何人也打得開", async () => {
    const { container } = setup({ body: emptyDocument("角色設定表") });
    expect(await screen.findByRole("button", { name: "＋ 新增人物" })).toBeTruthy();
    expect(entries(container)).toEqual([]);
  });
});

describe("新增人物：一列一列寫（驗收回饋 2026-10-26）", () => {
  it("按「＋ 新增人物」才長出一列空的名字欄，游標就在裡面", async () => {
    const { container } = setup();
    await screen.findByRole("button", { name: "＋ 新增人物" });
    expect(draftInput(container)).toBeNull();

    const input = await addInput(container);
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("名字按 Enter：收錄進表，游標進到那一位的介紹內文；可以接著再新增下一位", async () => {
    const { container } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "阿杰" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(entries(container)).toEqual(["若晴", "阿杰"]));
    await waitFor(() => expect(document.activeElement).toBe(descriptions(container)[1]));
    expect(draftInput(container)).toBeNull();
    expect(addButton()).toBeTruthy();
  });

  it("沒寫名字就按 Esc：那一列收掉，表不變", async () => {
    const { container, save } = setup();
    const input = await addInput(container);

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(draftInput(container)).toBeNull());
    expect(entries(container)).toEqual(["若晴"]);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("新增人物：回頭補表命中既有實體", () => {
  it("劇本裡已經有的人印出場數；已在表上的與孤兒不出現", async () => {
    const { container } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "小美" } });
    expect(menuRows(container)[0]).toBe("👤 小美（12 場）");
    expect(menuRows(container).some((row) => row.includes("前男友"))).toBe(false);

    fireEvent.change(input, { target: { value: "若晴" } });
    expect(menuRows(container).some((row) => row.startsWith("👤 若晴"))).toBe(false);
  });

  it("命中既有的那一位：排在最後，不會冒出第二個小美", async () => {
    const { container, createCharacter, save } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "小美" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
    expect(createCharacter).not.toHaveBeenCalled();
    saveNow();
    await waitFor(() => expect(lastSaved(save)).toEqual([ruoqing.id, xiaomei.id]));
  });

  it("沒有這個人：先建立人物，再收錄進表", async () => {
    const { container, createCharacter, save } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "阿杰" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(entries(container)).toEqual(["若晴", "阿杰"]));
    expect(createCharacter).toHaveBeenCalledWith("阿杰");
    saveNow();
    await waitFor(() => expect(lastSaved(save)).toEqual([ruoqing.id, "ch_new_阿杰"]));
  });
});

describe("移除與復原", () => {
  it("× 拿掉那一筆；⌘Z 拿回來", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));

    fireEvent.click(screen.getByRole("button", { name: "從人物介紹移除「若晴」" }));
    await waitFor(() => expect(entries(container)).toEqual(["小美"]));

    // jsdom 不是 Mac：Tiptap 的 `Mod-z` 在這裡是 Ctrl。
    fireEvent.keyDown(container.querySelector(".ProseMirror")!, { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
  });
});

describe("介紹內文寫進人物的描述欄", () => {
  it("離開欄位時存下去", async () => {
    const { saveDescription } = setup();
    const field = await screen.findByDisplayValue("三十歲，醫院護理師。");

    fireEvent.change(field, { target: { value: "三十歲，醫院護理師。幼時在海邊埋下一枚戒指。" } });
    fireEvent.blur(field);

    await waitFor(() =>
      expect(saveDescription).toHaveBeenCalledWith(ruoqing.id, "三十歲，醫院護理師。幼時在海邊埋下一枚戒指。"),
    );
  });

  it("打字停一下就存，不必離開欄位 —— 直接關分頁也不會掉", async () => {
    const { saveDescription } = setup();
    const field = await screen.findByDisplayValue("三十歲，醫院護理師。");

    fireEvent.change(field, { target: { value: "三十歲。" } });

    await waitFor(() => expect(saveDescription).toHaveBeenCalledWith(ruoqing.id, "三十歲。"), { timeout: 3000 });
  });

  it("沒改就不存", async () => {
    const { saveDescription } = setup();
    fireEvent.blur(await screen.findByDisplayValue("三十歲，醫院護理師。"));
    await act(async () => {});
    expect(saveDescription).not.toHaveBeenCalled();
  });
});

describe("改名：改的是人物實體的名字", () => {
  const renameTo = async (container: HTMLElement, name: string) => {
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    const input = container.querySelector<HTMLInputElement>(".character-entry__name")!;
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  it("劇本裡沒有一場印著舊名：直接改", async () => {
    const { container, rename } = setup({ count: 0 });
    await renameTo(container, "林若晴");

    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "林若晴", false));
  });

  it("還有幾場印著舊名：先問，代價寫在按下去之前", async () => {
    const { container, rename } = setup({ count: 2 });
    await renameTo(container, "林若晴");

    const choice = await screen.findByRole("group", { name: "劇本裡的舊名字要不要跟著改" });
    expect(rename.run).not.toHaveBeenCalled();
    expect(within(choice).getByRole("button", { name: "只改人物介紹 —— 劇本那 2 場繼續印「若晴」" })).toBeTruthy();

    fireEvent.click(within(choice).getByRole("button", { name: "連劇本那 2 場一起改成「林若晴」" }));
    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "林若晴", true));
    expect(entries(container)).toEqual(["林若晴"]);
  });

  it("問的時候按 Esc：不改，名字退回去", async () => {
    const { container, rename } = setup({ count: 2 });
    await renameTo(container, "林若晴");
    await screen.findByRole("group", { name: "劇本裡的舊名字要不要跟著改" });

    fireEvent.keyDown(container.querySelector(".character-entry__name")!, { key: "Escape" });
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(rename.run).not.toHaveBeenCalled();
  });

  it("改成另一位人物的名字：不改，說出撞到誰 —— 那會是第二個小美", async () => {
    const { container, rename } = setup({ body: sheetOf(ruoqing.id) });
    await renameTo(container, "小美");

    expect(await screen.findByText("已經有一位「小美」了")).toBeTruthy();
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(rename.count).not.toHaveBeenCalled();
  });

  it("孤兒不算撞名：改成它的名字照樣改", async () => {
    const { container, rename } = setup({ count: 0 });
    await renameTo(container, "小美的前男友");
    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "小美的前男友", false));
  });

  it("名字按 Enter：游標進到介紹內文", async () => {
    const { container } = setup({ count: 0 });
    await renameTo(container, "林若晴");
    await waitFor(() => expect(document.activeElement).toBe(descriptions(container)[0]));
  });

  it("清成空白不算改名", async () => {
    const { container, rename } = setup();
    await renameTo(container, "  ");
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(rename.count).not.toHaveBeenCalled();
  });
});
