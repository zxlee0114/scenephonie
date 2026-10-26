// @vitest-environment jsdom
/**
 * 票券 21 第 ② 片 —— 人物介紹（角色設定表）的編輯器。
 *
 * 表上每一位是一個人物引用，底下是他的介紹內文（這份 doc 的散文）；名字是人物實體的欄位。拖曳排序走
 * ProseMirror 內建、格式選單是 BubbleMenu —— jsdom 沒有版面，兩者留給人工驗收。
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { characterSheetIds, emptyDocument } from "@scenephonie/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SaveDoc } from "@/editor/save-capability";
import type { SaveToken } from "@/persistence";

import { CharacterSheetEditor, type RenameCharacter } from "./character-sheet-editor";

const token = "st_0" as SaveToken;

const ruoqing = { id: "ch_ruoqing", name: "若晴" };
const xiaomei = { id: "ch_xiaomei", name: "小美" };
/** ⌘Z 留下的孤兒：目錄裡有，但沒有任何引用指向她。 */
const orphan = { id: "ch_orphan", name: "小美的前男友" };

const DESCRIPTIONS: Record<string, string> = { [ruoqing.id]: "三十歲，醫院護理師。" };

const sheetOf = (...ids: string[]) => ({
  type: "doc",
  content: ids.map((characterId) => {
    const text = DESCRIPTIONS[characterId];
    return {
      type: "characterEntry",
      attrs: { characterId },
      content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }],
    };
  }),
});

function setup({
  body = sheetOf(ruoqing.id),
  count = 0,
  aliases = {},
}: { body?: object; count?: number; aliases?: Record<string, string[]> } = {}) {
  let minted = 0;
  const capabilities = {
    save: vi.fn<SaveDoc>(async () => ({ status: "saved", token })),
    // 每次都是一位新的人物（新的 id）—— 建兩次就是兩個阿杰，不會被「同一個人不收兩次」擋掉而看不出來。
    createCharacter: vi.fn(async (name: string) => ({ id: `ch_new_${name}${minted++ ? `_${minted}` : ""}`, name })),
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
      aliases={aliases}
      {...capabilities}
    />,
  );
  return { ...view, ...capabilities };
}

const entries = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLInputElement>(".character-entry__name")].map((input) => input.value);
const prose = (container: HTMLElement) => container.querySelector<HTMLElement>(".ProseMirror")!;
const addButton = () => screen.getByRole("button", { name: "＋ 新增人物" });
/** 按「＋ 新增人物」長出來的那一列的名字欄。 */
const draftInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>(".character-sheet__draft input");
/** 按「＋ 新增人物」，回傳長出來的名字欄。 */
const addInput = async (container: HTMLElement) => {
  fireEvent.click(await screen.findByRole("button", { name: "＋ 新增人物" }));
  return draftInput(container)!;
};
const menuRows = (container: HTMLElement) =>
  [...container.querySelectorAll(".character-sheet__draft .entity-field__menu li:not(.entity-field__menu-hint)")].map(
    (li) => li.textContent ?? "",
  );
/** 游標在哪一位的介紹內文裡（名字）；不在任何一位的內文裡就是 `null`。 */
const caretInDescriptionOf = (container: HTMLElement) => {
  if (document.activeElement !== prose(container)) return null;
  const anchor = window.getSelection()?.anchorNode;
  const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  if (!element?.closest(".character-entry__body")) return null;
  return element.closest(".character-entry")?.querySelector<HTMLInputElement>(".character-entry__name")?.value ?? null;
};
/** ⌘S：立刻存，不等打字停頓的 2.5 秒（`SaveStatusLine` 接這顆鍵）。 */
const saveNow = () => fireEvent.keyDown(window, { key: "s", metaKey: true });
/** 最後一次存檔送出的表：收錄了誰。 */
const lastSaved = (save: ReturnType<typeof setup>["save"]) => characterSheetIds(save.mock.calls.at(-1)?.[0]);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("表上每一位：名字是人物，介紹內文寫在底下", () => {
  it("每一位印人物的名字與介紹內文", async () => {
    const { container } = setup();
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(container.querySelector(".character-entry__body")?.textContent).toBe("三十歲，醫院護理師。");
  });

  it("還沒收錄任何人：只有按鈕，沒有一行點得進去、卻打不了字的空白", async () => {
    const { container } = setup({ body: emptyDocument("角色設定表") });
    expect(await screen.findByRole("button", { name: "＋ 新增人物" })).toBeTruthy();
    expect(entries(container)).toEqual([]);
    expect(container.querySelector<HTMLElement>(".character-sheet__list")?.hidden).toBe(true);
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

  it("⌘↵ 也是新增人物，游標在頁面上哪裡都算", async () => {
    const { container } = setup();
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));

    fireEvent.keyDown(container.querySelector(".character-entry__name")!, { key: "Enter", metaKey: true });

    await waitFor(() => expect(document.activeElement).toBe(draftInput(container)));
  });

  it("名字按 Enter：收錄進表，游標進到那一位的介紹內文；可以接著再新增下一位", async () => {
    const { container } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "阿杰" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(entries(container)).toEqual(["若晴", "阿杰"]));
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe("阿杰"));
    expect(draftInput(container)).toBeNull();
    expect(addButton()).toBeTruthy();
  });

  it("表上還沒有人時新增第一位：游標一樣進到他的介紹內文", async () => {
    // 瀏覽器不把焦點交給藏起來（`hidden`）的東西 —— 空表時整塊是藏著的。jsdom 沒有版面，這裡替它守這條規則。
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      if (!this.closest("[hidden]")) focus.call(this, options);
    });
    const { container } = setup({ body: emptyDocument("角色設定表") });
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "阿杰" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(entries(container)).toEqual(["阿杰"]));
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe("阿杰"));
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

  it("沒有「另一個名字」那一列：人物介紹上沒有「這一場的叫法」可取", async () => {
    const { container } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "小美" } });
    expect(menuRows(container)).toEqual(["👤 小美（12 場）"]);
    fireEvent.change(input, { target: { value: "小桃" } });
    expect(menuRows(container).some((row) => row.includes("另一個名字"))).toBe(false);
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
    // 游標移進介紹的那一下，名字欄會失焦 —— 那不是第二次定案。
    await act(async () => {});
    expect(createCharacter).toHaveBeenCalledTimes(1);
    expect(entries(container)).toEqual(["若晴", "阿杰"]);
    saveNow();
    await waitFor(() => expect(lastSaved(save)).toEqual([ruoqing.id, "ch_new_阿杰"]));
  });
});

describe("新增人物：撞到表上已經有的人", () => {
  it("名字是表上某一位的名字：對話框說已經有了，不另建一位；確認後回到名字欄", async () => {
    const { container, createCharacter } = setup();
    const input = await addInput(container);

    fireEvent.change(input, { target: { value: "若晴" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("「若晴」已經使用，請選擇另外一個名字。");
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(createCharacter).not.toHaveBeenCalled();
    expect(entries(container)).toEqual(["若晴"]);
    await waitFor(() => expect(document.activeElement).toBe(draftInput(container)));
  });
});

describe("別名：劇本裡叫過他的其他名字", () => {
  it("印在名字底下", async () => {
    const { container } = setup({ aliases: { [ruoqing.id]: ["阿晴", "林小姐"] } });
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(container.querySelector(".character-entry__aliases")?.textContent).toBe("別名：阿晴、林小姐");
  });

  it("沒有別名就不印", async () => {
    const { container } = setup();
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(container.querySelector(".character-entry__aliases")).toBeNull();
  });
});

describe("移除與復原", () => {
  it("× 拿掉那一位（連同介紹）；⌘Z 拿回來", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));

    fireEvent.click(screen.getByRole("button", { name: "從人物介紹移除「若晴」" }));
    await waitFor(() => expect(entries(container)).toEqual(["小美"]));

    // jsdom 不是 Mac：Tiptap 的 `Mod-z` 在這裡是 Ctrl。
    fireEvent.keyDown(prose(container), { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
    expect(screen.getByText("三十歲，醫院護理師。")).toBeTruthy();
  });

  it("點把手選起整位，按 ⌫ 就拿掉（同劇本的區塊把手）", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));

    fireEvent.click(container.querySelector(".character-entry__grip")!);
    // 選起來看得出來：那一位整塊上一層底色。
    await waitFor(() => expect(container.querySelector(".character-entry--selected .character-entry__name")).toBeTruthy());
    fireEvent.keyDown(prose(container), { key: "Backspace", code: "Backspace" });

    await waitFor(() => expect(entries(container)).toEqual(["小美"]));
  });
});

describe("改名：改的是人物實體的名字", () => {
  const renameTo = async (container: HTMLElement, name: string) => {
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    const input = container.querySelector<HTMLInputElement>(".character-entry__name")!;
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  it("劇本裡沒有一場印著舊名：直接改，不問", async () => {
    const { container, rename } = setup({ count: 0 });
    await renameTo(container, "林若晴");

    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "林若晴", false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("名字按 Enter：游標進到介紹內文", async () => {
    const { container } = setup({ count: 0 });
    await renameTo(container, "林若晴");
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe("林若晴"));
  });

  it("劇本裡用過這個名字：對話框問要不要一起改，選「是」連劇本一起改", async () => {
    const { container, rename } = setup({ count: 2 });
    await renameTo(container, "林若晴");

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("這名角色（原名：若晴）已經用於劇本當中，要一起改成「林若晴」嗎？");
    expect(rename.run).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "是" }));
    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "林若晴", true));
    await waitFor(() => expect(entries(container)).toEqual(["林若晴"]));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("選「否，只改人物介紹」：人物改名，劇本照舊 —— 舊名成了劇本裡的別名", async () => {
    const { container, rename } = setup({ count: 2 });
    await renameTo(container, "林若晴");

    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "否，只改人物介紹" }));
    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "林若晴", false));
    await waitFor(() => expect(container.querySelector(".character-entry__aliases")?.textContent).toBe("別名：若晴"));
  });

  it("跟其他對話框一致：主要動作「是」在右邊、預設焦點在它；← → 換顆", async () => {
    const { container } = setup({ count: 2 });
    await renameTo(container, "林若晴");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["否，只改人物介紹", "是"]);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("是"));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.textContent).toBe("否，只改人物介紹");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toBe("是");
  });

  it("一定要選：Esc 關不掉", async () => {
    const { container, rename } = setup({ count: 2 });
    await renameTo(container, "林若晴");
    const dialog = await screen.findByRole("alertdialog");

    fireEvent.keyDown(within(dialog).getByRole("button", { name: "是" }), { key: "Escape" });
    await act(async () => {});
    expect(screen.getByRole("alertdialog")).toBe(dialog);
    expect(rename.run).not.toHaveBeenCalled();
  });

  it("改成另一位人物的名字：對話框說撞到誰，確認後名字退回去 —— 那會是第二個小美", async () => {
    const { container, rename } = setup({ body: sheetOf(ruoqing.id) });
    await renameTo(container, "小美");

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("「小美」已經使用，請選擇另外一個名字。");
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(document.activeElement).toBe(container.querySelector(".character-entry__name"));
    expect(rename.count).not.toHaveBeenCalled();
  });

  it("孤兒不算撞名：改成它的名字照樣改", async () => {
    const { container, rename } = setup({ count: 0 });
    await renameTo(container, "小美的前男友");
    await waitFor(() => expect(rename.run).toHaveBeenCalledWith(ruoqing.id, "若晴", "小美的前男友", false));
  });

  it("清成空白不算改名", async () => {
    const { container, rename } = setup();
    await renameTo(container, "  ");
    await waitFor(() => expect(entries(container)).toEqual(["若晴"]));
    expect(rename.count).not.toHaveBeenCalled();
  });
});

describe("⌘A 一層一層往外選（驗收回饋 2026-10-26）", () => {
  /** jsdom 不是 Mac：Tiptap 的 `Mod-a` 在這裡是 Ctrl。 */
  const selectAll = (target: Element) => fireEvent.keyDown(target, { key: "a", code: "KeyA", ctrlKey: true });
  const selectedEntries = (container: HTMLElement) =>
    [...container.querySelectorAll(".character-entry--selected .character-entry__name")].map(
      (input) => (input as HTMLInputElement).value,
    );

  it("在介紹裡：先選這一位的介紹，再選整位，再選全部", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
    fireEvent.keyDown(container.querySelector(".character-entry__name")!, { key: "Enter" });
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe("若晴"));

    selectAll(prose(container));
    await waitFor(() => expect(window.getSelection()?.toString()).toBe("三十歲，醫院護理師。"));
    expect(selectedEntries(container)).toEqual([]);

    selectAll(prose(container));
    await waitFor(() => expect(selectedEntries(container)).toEqual(["若晴"]));

    selectAll(prose(container));
    // 全選之後 ⌫：兩位都拿掉了，才知道第三次選的是全部。
    fireEvent.keyDown(prose(container), { key: "Backspace", code: "Backspace" });
    await waitFor(() => expect(entries(container)).toEqual([]));
  });

  it("在名字裡：名字已經整串選起來時，再按一次選整位", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
    const name = container.querySelector<HTMLInputElement>(".character-entry__name")!;
    name.focus();
    name.setSelectionRange(0, 1);

    // 還沒整串選起來：這一下是名字欄自己的全選。
    selectAll(name);
    expect(selectedEntries(container)).toEqual([]);

    name.setSelectionRange(0, name.value.length);
    selectAll(name);
    await waitFor(() => expect(selectedEntries(container)).toEqual(["若晴"]));
  });
});

describe("方向鍵走得到名字（驗收回饋 2026-10-26）", () => {
  const names = (container: HTMLElement) => [...container.querySelectorAll<HTMLInputElement>(".character-entry__name")];
  const press = (target: Element, key: string) => fireEvent.keyDown(target, { key, code: key });
  /** 游標放進某一位介紹的開頭（名字 Enter 就會到那裡）。 */
  const caretIntoDescriptionOf = async (container: HTMLElement, at: number) => {
    fireEvent.keyDown(names(container)[at]!, { key: "Enter" });
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe(names(container)[at]!.value));
  };

  it("介紹最前面按 ←：回到這一位的名字", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
    await caretIntoDescriptionOf(container, 1);

    press(prose(container), "ArrowLeft");
    await waitFor(() => expect(document.activeElement).toBe(names(container)[1]));
  });

  it("介紹第一行按 ↑：回到這一位的名字，不跳過它", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));
    await caretIntoDescriptionOf(container, 1);

    press(prose(container), "ArrowUp");
    await waitFor(() => expect(document.activeElement).toBe(names(container)[1]));
  });

  it("名字按 ↓：進到這一位的介紹", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));

    press(names(container)[0]!, "ArrowDown");
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe("若晴"));
  });

  it("名字按 ↑：到上一位的介紹", async () => {
    const { container } = setup({ body: sheetOf(ruoqing.id, xiaomei.id) });
    await waitFor(() => expect(entries(container)).toEqual(["若晴", "小美"]));

    press(names(container)[1]!, "ArrowUp");
    await waitFor(() => expect(caretInDescriptionOf(container)).toBe("若晴"));
  });

  it.each(["ArrowDown", "ArrowRight"])("介紹最後面按 %s：到下一位的名字", async (key) => {
    // 小美還沒寫介紹：游標在開頭也就在字尾、在最後一行。
    const { container } = setup({ body: sheetOf(xiaomei.id, ruoqing.id) });
    await waitFor(() => expect(entries(container)).toEqual(["小美", "若晴"]));
    await caretIntoDescriptionOf(container, 0);

    press(prose(container), key);
    await waitFor(() => expect(document.activeElement).toBe(names(container)[1]));
  });
});
