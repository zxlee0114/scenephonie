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

const INFO_ROW = "ⓘ 關於地點 (⌥/)";
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

  it("↓ 走到說明列、Enter —— 說明面板取代選單", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    pointInto(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRow(container)).toBe(INFO_ROW);
    fireEvent.keyDown(input, { key: "Enter" });

    const panel = panelOf(container)!;
    expect(panel.textContent).toContain("接續子場次");
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

const INTEXT_ROW = "ⓘ 關於內外 (⌥/)";
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

  it("走到說明列、Enter —— 說明取代選單；Esc 退回選單，高亮停在說明列", () => {
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

    expect(backOf(container)).not.toBeNull();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(document.activeElement).toBe(button);
    expect(chipRows(container).at(-1)).toBe(INTEXT_ROW);
    expect(chipActive(container)).toBe(INTEXT_ROW);
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

const EXTRAS_ROW = "ⓘ 關於群演 (⌥/)";

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

describe("說明開著時的其他路（code review 2026-11-04）", () => {
  it("打到一半讀說明、再點別處 —— 照一般的離開定案，字不會卡在框裡", async () => {
    const { container } = render(
      <>
        <LocationHost />
        <button type="button">別處</button>
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "派出所" } });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => {});

    const away = [...container.querySelectorAll("button")].find((b) => b.textContent === "別處")!;
    fireEvent.pointerDown(away);
    away.focus();
    await waitFor(() => expect(container.querySelectorAll(".entity-chip")).toHaveLength(1));
    expect(input.value).toBe("");
    expect(menuRows(container)).toEqual([]);
  });

  it("群演欄也一樣：讀說明時點別處，打到一半的字照一般的離開定案", async () => {
    const { container } = render(
      <>
        <ExtrasHost />
        <a href="#x">別處</a>
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "路人 x3" } });
    fireEvent.keyDown(input, { key: "÷", code: "Slash", altKey: true });
    await act(async () => {});

    const away = container.querySelector("a")!;
    fireEvent.pointerDown(away);
    away.focus();
    await waitFor(() => expect(container.querySelectorAll(".entity-chip")).toHaveLength(1));
    expect(input.value).toBe("");
  });

  it("⌥/ 開說明也一樣取代選單", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "派" } });
    expect(menuRows(container).length).toBeGreaterThan(0);

    fireEvent.keyDown(input, { key: "÷", code: "Slash", altKey: true });
    expect(panelOf(container)).not.toBeNull();
    expect(menuRows(container)).toEqual([]);
  });

  it("滑鼠點選單裡的候選不算「點進欄位」—— 選完不留下一份只有說明列的選單", async () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "派" } });
    const candidate = [...container.querySelectorAll(".entity-field__menu li")].find((li) =>
      li.textContent?.includes("派出所"),
    )!;
    fireEvent.pointerDown(candidate);
    fireEvent.mouseDown(candidate);
    await waitFor(() => expect(container.querySelectorAll(".entity-chip")).toHaveLength(1));
    expect(menuRows(container)).toEqual([]);
  });

  it("內外欄：離開雜景的面板開著時讀說明、再點別處 —— 面板不會在失焦後又冒出來", () => {
    const leave: ChipConfirm = {
      note: "這場目前有 2 個地點",
      rows: [
        { key: "go", label: "前往地點欄編輯", run: () => {} },
        { key: "keep", label: "維持雜景", run: () => {} },
      ],
    };
    const { container } = render(
      <>
        <IntExtHost confirm={(next) => (next === "雜景" ? null : leave)} />
        <a href="#x">別處</a>
      </>,
    );
    const button = container.querySelector("button")!;
    button.focus();
    fireEvent.click(button);
    fireEvent.mouseDown(
      [...container.querySelectorAll(".chip-select__menu li")].find((li) => li.textContent?.startsWith("內景"))!,
    );
    fireEvent.keyDown(button, { key: "ArrowUp" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(panelOf(container)).not.toBeNull();

    const away = container.querySelector("a")!;
    fireEvent.pointerDown(away);
    away.focus();
    expect(panelOf(container)).toBeNull();
    expect(chipRows(container)).toEqual([]);
  });
});

const BACK = "← 返回 (Esc)";
const backOf = (c: HTMLElement) =>
  [...(panelOf(c)?.querySelectorAll("button") ?? [])].find((b) => b.textContent === BACK) ?? null;

describe("說明面板的返回列（票 101 第二輪）", () => {
  it("地點欄：從說明列打開 —— 面板最上面是返回列；按它回到選單、停在說明列", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    pointInto(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    const panel = panelOf(container)!;
    const back = backOf(container)!;
    expect(back).not.toBeNull();
    // 標題前面 —— 內文再長，一打開也看得到
    expect(back.compareDocumentPosition(panel.querySelector("h2")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(back);
    expect(panelOf(container)).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(menuRows(container)).toEqual([INFO_ROW]);
    expect(activeRow(container)).toBe(INFO_ROW);
  });

  it("地點欄：Esc 與返回列做同一件事（退一層），再按 Esc 才收起選單", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    pointInto(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });
    expect(panelOf(container)).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(activeRow(container)).toBe(INFO_ROW);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(menuRows(container)).toEqual([]);
  });

  it("地點欄：在候選上按 ⌥/ —— Esc 回來高亮停在同一個候選，打到一半的字還在", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "派" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const before = activeRow(container);
    expect(before).not.toBe(menuRows(container)[0]); // 確實離開了預選的第一列

    fireEvent.keyDown(input, { key: "÷", code: "Slash", altKey: true });
    expect(backOf(container)).not.toBeNull();
    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });

    expect(input.value).toBe("派");
    expect(activeRow(container)).toBe(before);
  });

  it("地點欄：打開前沒有選單（Tab 進來直接 ⌥/）—— 沒有返回列，Esc 只回到欄位", () => {
    const { container } = render(<LocationHost />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.keyDown(input, { key: "÷", code: "Slash", altKey: true });

    expect(panelOf(container)).not.toBeNull();
    expect(backOf(container)).toBeNull();
    fireEvent.keyDown(panelOf(container)!, { key: "Escape" });
    expect(document.activeElement).toBe(input);
    expect(menuRows(container)).toEqual([]);
  });

  it("地點欄：待確認面板上打開說明 —— 返回列回到待確認面板，高亮停在說明列", async () => {
    const { container } = render(<LocationHost initial={[{ id: "lo_1", displayName: "海豚公寓房間" }]} confirm />);
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.change(input, { target: { value: "警局" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(container.querySelector(".entity-field__confirm")).not.toBeNull());

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(backOf(container)!);

    expect(container.querySelector(".entity-field__confirm li.is-active")?.textContent).toBe(INFO_ROW);
    expect(document.activeElement).toBe(input);
  });

  it("觸控直接點說明列（沒有 hover 那一下）—— 返回後一樣停在說明列", () => {
    const { container } = render(<LocationHost />);
    pointInto(container.querySelector("input")!);
    const row = [...container.querySelectorAll(".entity-field__menu li")].find(
      (li) => li.textContent === INFO_ROW,
    )!;
    fireEvent.mouseDown(row);
    fireEvent.click(backOf(container)!);
    expect(activeRow(container)).toBe(INFO_ROW);
  });

  it("內外欄：離開雜景的面板上點說明列 —— 返回後回到那個面板、停在說明列", () => {
    const leave: ChipConfirm = {
      note: "這場目前有 2 個地點",
      rows: [
        { key: "go", label: "前往地點欄編輯", run: () => {} },
        { key: "keep", label: "維持雜景", run: () => {} },
      ],
    };
    const { container } = render(<IntExtHost confirm={(next) => (next === "雜景" ? null : leave)} />);
    const button = container.querySelector("button")!;
    button.focus();
    fireEvent.click(button);
    fireEvent.mouseDown(
      [...container.querySelectorAll(".chip-select__menu li")].find((li) => li.textContent?.startsWith("內景"))!,
    );
    // 觸控：直接點，不經過 hover
    fireEvent.mouseDown([...container.querySelectorAll(".chip-select__menu li")].at(-1)!);
    fireEvent.click(backOf(container)!);

    expect(chipRows(container)).toEqual(["前往地點欄編輯", "維持雜景", INTEXT_ROW]);
    expect(chipActive(container)).toBe(INTEXT_ROW);
    expect(document.activeElement).toBe(button);
  });

  it("群演欄：點進空欄位、走到說明列打開 —— 返回列回到選單，停在說明列", () => {
    const { container } = render(<ExtrasHost />);
    const input = container.querySelector("input")!;
    pointInto(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(backOf(container)!);
    expect(document.activeElement).toBe(input);
    expect(menuRows(container)).toEqual([EXTRAS_ROW]);
    expect(activeRow(container)).toBe(EXTRAS_ROW);
  });
});

describe("只有說明列的選單跟著焦點走（票 101 驗收回饋 2026-11-05）", () => {
  it("點在群演欄的框邊（焦點沒進輸入框）再去點地點欄 —— 群演那份不留在畫面上", () => {
    const { container } = render(
      <>
        <LocationHost />
        <ExtrasHost />
      </>,
    );
    const extras = container.querySelector<HTMLElement>(".extras-field")!;
    fireEvent.pointerDown(extras); // 框的內距，不是輸入框：焦點不會進來
    expect(menuRows(container)).toContain(EXTRAS_ROW);

    const location = container.querySelector("input")!;
    pointInto(location);
    expect(menuRows(container)).not.toContain(EXTRAS_ROW);
    expect(menuRows(container)).toContain(INFO_ROW);
  });
});
