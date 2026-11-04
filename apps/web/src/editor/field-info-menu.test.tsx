// @vitest-environment jsdom
/**
 * 欄位說明改成下拉選單的一列（票 101）。
 *
 * ⓘ 按鈕拿掉之後，滑鼠／觸控使用者唯一的路是「點進欄位 → 選單最下面那一列」；鍵盤使用者
 * 照舊是 ⌥/，而那一列把 ⌥/ 印在畫面上。這裡守住的是票 101 結論的那幾條：
 * 只有指標點進來才開、永不預選、選了就換成說明面板、關掉之後該回哪裡就回哪裡。
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChipSelect, type ChipConfirm } from "./chip-select";
import { EntityField, type EntityRef } from "./entity-field";
import { ExtrasField } from "./extras-field";
import type { ExtraRef } from "@scenephonie/schema";
import { FieldInfo } from "./field-info";

const dolphinApartment = { id: "lo_1", name: "海豚公寓房間" };
const policeStation = { id: "lo_2", name: "派出所" };

function LocationHost({
  initial = [],
  onKeyDown,
  confirm = false,
}: {
  initial?: EntityRef[];
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  confirm?: boolean;
}) {
  const [refs, setRefs] = useState<EntityRef[]>(initial);
  return (
    <FieldInfo info="location">
      {(describedBy) => (
        <EntityField
          kind="location"
          placeholder="地點"
          refs={refs}
          options={[dolphinApartment, policeStation]}
          multiple={false}
          onCommit={setRefs}
          onCreate={async (name) => ({ id: `lo_new_${name}`, name })}
          describedBy={describedBy}
          onKeyDown={onKeyDown}
          confirmReplace={confirm ? {} : undefined}
        />
      )}
    </FieldInfo>
  );
}

const INFO_ROW = "ⓘ 關於地點（⌥/）";
const menuRows = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-field__menu li:not(.entity-field__menu-hint)")].map(
    (li) => li.textContent ?? "",
  );
const activeRow = (root: HTMLElement) =>
  root.querySelector(".entity-field__menu li.is-active")?.textContent ?? null;
const panelOf = (c: HTMLElement) => c.querySelector<HTMLElement>('[role="dialog"]');

/** 指標點進輸入框：pointerdown 先到，焦點後到（瀏覽器的順序）。 */
function pointInto(input: HTMLInputElement) {
  fireEvent.pointerDown(input);
  input.focus();
}

afterEach(() => cleanup());

describe("說明列：地點欄（EntityField）", () => {
  it("指標點進空欄位 —— 開出只有說明列的選單", () => {
    const { container } = render(<LocationHost />);
    pointInto(container.querySelector("input")!);
    expect(menuRows(container)).toEqual([INFO_ROW]);
  });

  it("Tab 走進來不開 —— 路過的鍵盤使用者不被打擾", () => {
    const { container } = render(<LocationHost />);
    container.querySelector("input")!.focus();
    expect(menuRows(container)).toEqual([]);
  });

  it("說明列永不預選 —— 只有它時 Enter 照原路交給呼叫端", () => {
    const onKeyDown = vi.fn();
    const { container } = render(<LocationHost onKeyDown={onKeyDown} />);
    const input = container.querySelector("input")!;
    pointInto(input);

    expect(activeRow(container)).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(panelOf(container)).toBeNull();
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
  });

  it("↓ 走到說明列、Enter —— 說明面板取代選單；Esc 回欄位，選單不自己彈回來", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    pointInto(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRow(container)).toBe(INFO_ROW);
    fireEvent.keyDown(input, { key: "Enter" });

    const panel = panelOf(container)!;
    expect(panel.textContent).toContain("接續子場次");
    expect(menuRows(container)).toEqual([]);

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(panelOf(container)).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(menuRows(container)).toEqual([]);
  });

  it("滑鼠點說明列也一樣開說明", () => {
    const { container } = render(<LocationHost />);
    pointInto(container.querySelector("input")!);
    const row = [...container.querySelectorAll(".entity-field__menu li")].find(
      (li) => li.textContent === INFO_ROW,
    )!;
    fireEvent.mouseDown(row);
    expect(panelOf(container)).not.toBeNull();
  });

  it("有字時說明列排最後，預選照舊是第一個候選", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    input.focus(); // Tab 進來也一樣：一打字選單就開，說明列在裡面
    fireEvent.change(input, { target: { value: "派" } });

    const rows = menuRows(container);
    expect(rows[0]).toContain("派出所");
    expect(rows.at(-1)).toBe(INFO_ROW);
    expect(activeRow(container)).toContain("派出所");
  });

  it("打到一半去讀說明，回來字還在框裡（讀說明不算離開欄位）", async () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "派" } });

    fireEvent.keyDown(input, { key: "ArrowUp" }); // 從第一個候選繞到最後的說明列
    expect(activeRow(container)).toBe(INFO_ROW);
    fireEvent.keyDown(input, { key: "Enter" });
    // 焦點進面板那一下若被當成離開，blur 會把「派」定案成 chip（建實體是非同步的，等它跑完）。
    await act(async () => {});
    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });
    await act(async () => {});

    expect(input.value).toBe("派");
    expect(container.querySelectorAll(".entity-chip")).toHaveLength(0);
  });

  it("待確認面板最後也有說明列；看完說明回到待確認面板", async () => {
    const { container } = render(<LocationHost initial={[{ id: "lo_1", displayName: "海豚公寓房間" }]} confirm />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "警局" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const confirmRows = () =>
      [...container.querySelectorAll(".entity-field__confirm li")].map((li) => li.textContent);
    await waitFor(() => expect(confirmRows().at(-1)).toBe(INFO_ROW));
    // 預選仍是第一列「是，改成…」
    expect(container.querySelector(".entity-field__confirm li.is-active")?.textContent).toContain("是，改成");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(container.querySelector(".entity-field__confirm")).toBeNull();

    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });
    expect(confirmRows().at(-1)).toBe(INFO_ROW);
    expect(confirmRows()[0]).toContain("是，改成「警局」");
  });
});

function IntExtHost({ confirm }: { confirm?: (next: string) => ChipConfirm | null }) {
  const [value, setValue] = useState("雜景");
  return (
    <FieldInfo info="intExt">
      {(describedBy) => (
        <ChipSelect
          value={value}
          options={["內景", "外景", "內外景", "雜景"]}
          placeholder="內外"
          onChange={setValue}
          describedBy={describedBy}
          confirm={confirm}
        />
      )}
    </FieldInfo>
  );
}

const INTEXT_ROW = "ⓘ 關於內外（⌥/）";
const chipRows = (root: HTMLElement) =>
  [...root.querySelectorAll(".chip-select__menu li")].map((li) => li.textContent ?? "");
const chipActive = (root: HTMLElement) =>
  root.querySelector(".chip-select__menu li.is-active")?.textContent ?? null;

describe("說明列：內外欄（ChipSelect）", () => {
  it("點開的選單最後一列是說明列，預選照舊是目前的值", () => {
    const { container } = render(<IntExtHost />);
    fireEvent.click(container.querySelector("button")!);
    expect(chipRows(container).at(-1)).toBe(INTEXT_ROW);
    expect(chipActive(container)).toBe("雜景");
  });

  it("走到說明列、Enter —— 說明取代選單；Esc 回到這一格，選單不彈回來", () => {
    const { container } = render(<IntExtHost />);
    const button = container.querySelector("button")!;
    button.focus();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "ArrowDown" }); // 雜景是最後一個值，下一列就是說明列
    expect(chipActive(container)).toBe(INTEXT_ROW);
    fireEvent.keyDown(button, { key: "Enter" });

    const panel = panelOf(container)!;
    expect(panel.textContent).toContain("雜景");
    expect(chipRows(container)).toEqual([]);

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(document.activeElement).toBe(button);
    expect(chipRows(container)).toEqual([]);
  });

  it("離開雜景的說明面板也有說明列；看完回到那個面板", () => {
    const leave: ChipConfirm = {
      note: "這場目前有 2 個地點（派出所、警局），若要使用「內景」，只能保留一個地點",
      rows: [
        { key: "go", label: "前往地點欄編輯", run: () => {} },
        { key: "keep", label: "維持雜景", run: () => {} },
      ],
    };
    const { container } = render(<IntExtHost confirm={(next) => (next === "雜景" ? null : leave)} />);
    const button = container.querySelector("button")!;
    button.focus();
    fireEvent.click(button);
    const inner = [...container.querySelectorAll(".chip-select__menu li")].find((li) =>
      li.textContent?.startsWith("內景"),
    )!;
    fireEvent.mouseDown(inner);

    expect(chipRows(container)).toEqual(["前往地點欄編輯", "維持雜景", INTEXT_ROW]);
    expect(chipActive(container)).toBe("前往地點欄編輯");

    fireEvent.keyDown(button, { key: "ArrowUp" }); // 從第一列繞到最後的說明列
    fireEvent.keyDown(button, { key: "Enter" });
    expect(container.querySelector(".chip-select__confirm")).toBeNull();

    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });
    expect(chipRows(container)).toEqual(["前往地點欄編輯", "維持雜景", INTEXT_ROW]);
  });
});

function ExtrasHost({ onKeyDown }: { onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void }) {
  const [extras, setExtras] = useState<ExtraRef[]>([]);
  return (
    <FieldInfo info="extras">
      {(describedBy) => (
        <ExtrasField
          extras={extras}
          suggestions={() => ["咖啡廳客人"]}
          onCommit={setExtras}
          describedBy={describedBy}
          onKeyDown={onKeyDown}
        />
      )}
    </FieldInfo>
  );
}

const EXTRAS_ROW = "ⓘ 關於群演（⌥/）";

describe("說明列：群演欄（ExtrasField）", () => {
  it("指標點進空欄位開出說明列；Tab 進來不開", () => {
    const { container } = render(<ExtrasHost />);
    const input = container.querySelector("input")!;
    input.focus();
    expect(menuRows(container)).toEqual([]);
    input.blur();

    pointInto(input);
    expect(menuRows(container)).toEqual([EXTRAS_ROW]);
  });

  it("只有說明列時不預選，Enter 照原路交給呼叫端；↓ 走到它再 Enter 才開說明", () => {
    const onKeyDown = vi.fn();
    const { container } = render(<ExtrasHost onKeyDown={onKeyDown} />);
    const input = container.querySelector("input")!;
    pointInto(input);

    expect(activeRow(container)).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(panelOf(container)).toBeNull();
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(panelOf(container)?.textContent).toContain("齊聲");
    expect(menuRows(container)).toEqual([]);
  });

  it("有字時說明列排最後，預選照舊是第一列；讀完說明字還在", async () => {
    const { container } = render(<ExtrasHost />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "咖啡" } });

    expect(menuRows(container).at(-1)).toBe(EXTRAS_ROW);
    expect(activeRow(container)).not.toBe(EXTRAS_ROW);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeRow(container)).toBe(EXTRAS_ROW);
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => {});
    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });
    await act(async () => {});
    expect(input.value).toBe("咖啡");
    expect(container.querySelectorAll(".entity-chip")).toHaveLength(0);
  });
});
