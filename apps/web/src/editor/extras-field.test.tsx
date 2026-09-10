// @vitest-environment jsdom
/**
 * 群演欄的驗收（票券 09）：多組「描述 x 人數」、跨場次描述**只補字串**、
 * 注音組字期間不動作、重新編輯保住 `extraId`。
 */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { mintExtraId, type ExtraRef } from "@scenephonie/schema";

import { ExtrasField } from "./extras-field";

function Host({
  initial = [],
  suggestions = [],
  onChangeExtras,
}: {
  initial?: ExtraRef[];
  suggestions?: string[];
  onChangeExtras?: (extras: ExtraRef[]) => void;
}) {
  const [extras, setExtras] = useState<ExtraRef[]>(initial);
  return (
    <ExtrasField
      extras={extras}
      suggestions={() => suggestions}
      onCommit={(next) => {
        setExtras(next);
        onChangeExtras?.(next);
      }}
    />
  );
}

const chipTexts = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-chip")].map(
    (c) => c.textContent?.replace(/[×👥]/gu, "").trim() ?? "",
  );
const rows = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-field__menu:not(.entity-field__menu--preview) li")].map(
    (li) => li.textContent ?? "",
  );
const previewRows = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-field__menu--preview li")].map((li) => li.textContent ?? "");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("多組「描述 x 人數」", () => {
  it("頓號分隔，一次打好幾組", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8、服務生 x2、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人 x8", "服務生 x2"]));
    expect(input.value).toBe("");
  });

  it("沒寫人數就是一位", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "服務生" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["服務生 x1"]));
  });

  it("描述裡的空白留著（多值欄輸入規則）", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳 客人 x8、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳 客人 x8"]));
  });

  it("離開欄位時把還沒切成 chip 的字定案", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "路人 x3" } });
    fireEvent.blur(input);

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人 x3"]));
  });

  it("× 拿掉一筆", async () => {
    const { container } = render(
      <Host initial={[{ extraId: mintExtraId(), description: "客人", count: 8 }]} />,
    );

    fireEvent.mouseDown(container.querySelector(".entity-chip__remove")!);

    await waitFor(() => expect(chipTexts(container)).toEqual([]));
  });
});

describe("跨場次描述：只補字串、不建立連結", () => {
  it("選一列只是把描述填進輸入框 —— 這一刻什麼都還沒建立", async () => {
    const { container } = render(<Host suggestions={["咖啡廳客人"]} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡" } });
    await waitFor(() => expect(rows(container)).toEqual(["＋ 新增群演「咖啡」1 人", "👥 咖啡廳客人"]));

    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[1]!);

    await waitFor(() => expect(input.value).toBe("咖啡廳客人"));
    expect(chipTexts(container)).toEqual([]); // 還沒定案，人數也還沒決定
  });

  it("補完字串再打人數，定案的是新鑄的一筆（與別場沒有任何連結）", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = render(
      <Host suggestions={["咖啡廳客人"]} onChangeExtras={(e) => committed.push(e)} />,
    );
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人 x8"]));
    const [written] = committed.at(-1)!;
    expect(written!.extraId.startsWith("ex_")).toBe(true);
    expect(written).toMatchObject({ description: "咖啡廳客人", count: 8 });
  });

  it("這一場已經有的描述不列 —— 它就在旁邊當 chip", async () => {
    const { container } = render(
      <Host
        initial={[{ extraId: mintExtraId(), description: "咖啡廳客人", count: 8 }]}
        suggestions={["咖啡廳客人", "咖啡廳服務生"]}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡" } });

    await waitFor(() =>
      expect(rows(container)).toEqual(["＋ 新增群演「咖啡」1 人", "👥 咖啡廳服務生"]),
    );
  });

  it("已經打成同一串字時不再列那一列（沒東西可補）", async () => {
    const { container } = render(<Host suggestions={["咖啡廳客人"]} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });

    await waitFor(() => expect(rows(container)).toEqual(["＋ 新增群演「咖啡廳客人」8 人"]));
  });
});

describe("注音組字期間選單完全不動作（§7.6）", () => {
  it("組字中不切 chip、不接手 Enter；浮出的預覽只是一瞥", async () => {
    const { container } = render(<Host suggestions={["咖啡廳客人"]} />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "咖啡" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    // 看得見不等於動得了：預覽在，可操作的那份選單這一刻不存在。
    await waitFor(() => expect(previewRows(container)).toEqual(["👥 咖啡廳客人"]));
    expect(rows(container)).toEqual([]);

    fireEvent.change(input, { target: { value: "咖啡、" } });
    expect(chipTexts(container)).toEqual([]); // 組字中的頓號不切 chip

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8、" } });
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人 x8"]));
  });
});

describe("重新編輯", () => {
  it("改到一半打成沒有描述的字（只剩 `x8`）不會把那一筆吞掉", async () => {
    const extraId = mintExtraId();
    const { container } = render(
      <Host initial={[{ extraId, description: "咖啡廳客人", count: 8 }]} />,
    );
    const input = container.querySelector("input")!;

    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    await waitFor(() => expect(input.value).toBe("咖啡廳客人 x8"));
    fireEvent.change(input, { target: { value: "x8" } });
    fireEvent.blur(input);

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人 x8"]));
  });

  it("點 chip 把描述與人數一起放回輸入框，改完仍是**同一筆** extraId", async () => {
    const extraId = mintExtraId();
    const committed: ExtraRef[][] = [];
    const { container } = render(
      <Host
        initial={[{ extraId, description: "咖啡廳客人", count: 8 }]}
        onChangeExtras={(e) => committed.push(e)}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    await waitFor(() => expect(input.value).toBe("咖啡廳客人 x8"));

    fireEvent.change(input, { target: { value: "咖啡廳客人 x9" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // 同一筆 id —— 對白的人物欄可能正指著它，換 id 會讓那句台詞的引用當場懸空。
    await waitFor(() =>
      expect(committed.at(-1)).toEqual([{ extraId, description: "咖啡廳客人", count: 9 }]),
    );
  });

  it("空欄位上 Backspace 把最後一筆還原成可編輯文字", async () => {
    const { container } = render(
      <Host initial={[{ extraId: mintExtraId(), description: "客人", count: 8 }]} />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });

    await waitFor(() => expect(input.value).toBe("客人 x8"));
    expect(chipTexts(container)).toEqual([]);
  });
});
