// @vitest-environment jsdom
/**
 * 欄位說明（ⓘ）的三條路 —— 見 `field-info.tsx` 檔頭那張表。
 *
 * 這裡真正要守住的不是「彈窗會不會開」，而是**把 icon 移出 tab 序之後，鍵盤使用者仍然到得了**。
 * 那個取捨（每一場都要 Tab 走一遍 metadata，四個 icon 會讓那條路加倍長）只有在補償措施
 * 都在時才成立，所以三條路各有一條測試：拿掉任何一條，`tabIndex={-1}` 就變成 WCAG 2.1.1 的
 * 違規而不是取捨。
 */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FIELD_INFO, FieldInfo, HELP_KEY_HINT } from "./field-info";

function Host({ info }: { info: "location" | "intExt" }) {
  return <FieldInfo info={info}>{(describedBy) => (
    <input aria-label="欄位" aria-describedby={describedBy} aria-keyshortcuts={HELP_KEY_HINT} />
  )}</FieldInfo>;
}

const panelOf = (c: HTMLElement) => c.querySelector<HTMLElement>('[role="dialog"]');

describe("欄位說明", () => {
  it("螢幕閱讀器那條路：欄位的 aria-describedby 指向一句話，不必開彈窗", () => {
    const { container } = render(<Host info="location" />);
    const input = container.querySelector("input")!;

    const describedBy = input.getAttribute("aria-describedby")!;
    expect(describedBy).toBeTruthy();
    // useId 產的 id 含 `:`，選擇器不吃 —— 用 getElementById（jsdom 也沒有 CSS.escape）。
    expect(document.getElementById(describedBy)?.textContent).toBe(FIELD_INFO.location.summary);
  });

  it("icon 不進 tab 序 —— 但純鍵盤那條路是欄位上的 ⌥/", () => {
    const { container } = render(<Host info="location" />);
    const input = container.querySelector("input")!;
    const button = container.querySelector("button")!;

    expect(button.tabIndex).toBe(-1);
    expect(input.getAttribute("aria-keyshortcuts")).toBe("Alt+/");

    expect(panelOf(container)).toBeNull();
    fireEvent.keyDown(input, { key: "÷", code: "Slash", altKey: true });
    expect(panelOf(container)).not.toBeNull();
  });

  it("Esc 關閉，焦點回到欄位（不是回到 Tab 走不到的 icon）", () => {
    const { container } = render(<Host info="location" />);
    const input = container.querySelector("input")!;
    input.focus();

    fireEvent.keyDown(input, { key: "÷", code: "Slash", altKey: true });
    const panel = panelOf(container)!;
    expect(document.activeElement).toBe(panel);

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(panelOf(container)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("地點的說明給的是兩條出路，不是一條", () => {
    const { container } = render(<Host info="location" />);
    fireEvent.keyDown(container.querySelector("input")!, { key: "÷", code: "Slash", altKey: true });

    const text = panelOf(container)!.textContent ?? "";
    // 雜景接的是快速跳接的散文，接續子場次接的是連續動作 —— 只給一條，編劇會把走廊戲寫成雜景。
    expect(text).toContain("雜景");
    expect(text).toContain("接續子場次");
  });

  it("F1 不再是那顆鍵 —— macOS 的 F1 預設是螢幕亮度，那條路等於不存在", () => {
    const { container } = render(<Host info="location" />);
    fireEvent.keyDown(container.querySelector("input")!, { key: "F1" });
    expect(panelOf(container)).toBeNull();
  });

  it("懸停提示把快捷鍵印在 icon 旁邊 —— 但不進無障礙樹（欄位已經宣告過了）", () => {
    const { container } = render(<Host info="location" />);
    const hint = container.querySelector(".field-info__hint")!;
    expect(hint.textContent).toBe("⌥/");
    expect(hint.getAttribute("aria-hidden")).toBe("true");
  });

  it("內外的說明講的是雜景為什麼長在這一欄", () => {
    const { container } = render(<Host info="intExt" />);
    fireEvent.keyDown(container.querySelector("input")!, { key: "÷", code: "Slash", altKey: true });

    expect(panelOf(container)!.textContent).toContain("台灣業界既有的寫法");
  });
});
