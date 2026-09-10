// @vitest-environment jsdom
/**
 * 快捷鍵總覽（票券 34 第五輪，使用者要求：「把這些快捷鍵記錄下來，可能會需要一個面板」）。
 *
 * 這份表是**手動維護**的（見 `shortcuts.ts` 檔頭：keymap 是宣告式字串、node view 那幾顆是
 * 手寫的 `event.key` 比對，兩邊對不起來）。所以這裡釘住的是「面板本身沒壞」與**幾條最容易
 * 走散的鍵**——改了鍵而忘了改表時，至少這幾條會紅。
 */
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ShortcutOverview } from "./shortcut-overview";
import { SHORTCUTS, isShortcutOverviewKey } from "./shortcuts";

afterEach(() => {
  document.body.innerHTML = "";
});

/**
 * 派到 `document` 而不是 `window`：監聽掛在 window 上，事件從 document 冒泡得過去，
 * 而 `fireEvent` 會把 React 的狀態更新包進 `act`（直接 `window.dispatchEvent` 不會，
 * 面板要等下一次 render 才出現，斷言就撲空）。
 */
const press = (init: KeyboardEventInit) => fireEvent.keyDown(document, init);

describe("怎麼開、怎麼關", () => {
  it("⌘/ 打開，再按一次關掉", () => {
    render(<ShortcutOverview />);
    expect(document.querySelector(".shortcut-overview")).toBeNull();

    press({ key: "/", code: "Slash", metaKey: true });
    expect(document.querySelector(".shortcut-overview")).not.toBeNull();

    press({ key: "/", code: "Slash", metaKey: true });
    expect(document.querySelector(".shortcut-overview")).toBeNull();
  });

  it("Esc 關掉（只有開著時才是我們的）", () => {
    render(<ShortcutOverview />);
    press({ key: "/", code: "Slash", ctrlKey: true }); // Windows／Linux 那一半
    expect(document.querySelector(".shortcut-overview")).not.toBeNull();

    press({ key: "Escape" });
    expect(document.querySelector(".shortcut-overview")).toBeNull();
  });

  it("焦點進面板，關掉時還給原本那個元素", () => {
    const before = document.createElement("input");
    document.body.append(before);
    before.focus();

    render(<ShortcutOverview />);
    press({ key: "/", code: "Slash", metaKey: true });
    expect(document.activeElement).toBe(document.querySelector(".shortcut-overview"));

    press({ key: "Escape" });
    expect(document.activeElement).toBe(before);
  });

  it("一顆常駐的鈕 —— 只有快捷鍵打得開的快捷鍵說明是笑話", () => {
    const { container } = render(<ShortcutOverview />);
    const trigger = container.querySelector<HTMLButtonElement>(".shortcut-overview__trigger")!;
    expect(trigger.textContent).toContain("快捷鍵");

    fireEvent.click(trigger);
    expect(document.querySelector(".shortcut-overview")).not.toBeNull();
  });

  it("⌥/ 不是這一顆 —— 那是欄位說明（同一顆實體鍵、不同修飾鍵）", () => {
    expect(isShortcutOverviewKey({ key: "÷", code: "Slash", altKey: true, metaKey: false, ctrlKey: false })).toBe(false);
    expect(isShortcutOverviewKey({ key: "/", code: "Slash", altKey: false, metaKey: true, ctrlKey: false })).toBe(true);
    // 沒有修飾鍵的 `/` 是斜線選單，不能被搶走。
    expect(isShortcutOverviewKey({ key: "/", code: "Slash", altKey: false, metaKey: false, ctrlKey: false })).toBe(false);
  });
});

describe("表的內容", () => {
  const allRows = SHORTCUTS.flatMap((g) => g.rows);
  const has = (keys: string[]) =>
    allRows.some((r) => r.keys.length === keys.length && r.keys.every((k, i) => k === keys[i]));

  it("這一票新加的鍵都在表上", () => {
    expect(has(["⌘", "↓"])).toBe(true); // 從簡表直接進內文
    expect(has(["⌘", "↑"])).toBe(true); // 從簡表直接回上一場末端
    expect(has(["⌘", "←"])).toBe(true); // 到這一格的最前面
    expect(has(["⌘", "→"])).toBe(true); // 到這一格的最後面
    expect(has(["I"])).toBe(true); // 內外的速記鍵
    expect(has(["D"])).toBe(true); // 時間的速記鍵
  });

  it("每一列都有按鍵與說明，沒有空的", () => {
    for (const group of SHORTCUTS) {
      expect(group.rows.length).toBeGreaterThan(0);
      for (const row of group.rows) {
        expect(row.keys.length).toBeGreaterThan(0);
        expect(row.what.length).toBeGreaterThan(0);
      }
    }
  });

  it("每一組都畫得出來，按鍵排成 kbd", () => {
    render(<ShortcutOverview />);
    press({ key: "/", code: "Slash", metaKey: true });

    const titles = [...document.querySelectorAll(".shortcut-overview__group-title")].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(SHORTCUTS.map((g) => g.title));
    expect(document.querySelectorAll(".shortcut-overview kbd").length).toBe(
      SHORTCUTS.flatMap((g) => g.rows).reduce((n, r) => n + r.keys.length, 0),
    );
  });
});
