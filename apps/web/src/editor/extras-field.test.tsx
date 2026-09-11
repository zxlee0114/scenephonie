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
    await waitFor(() =>
      expect(rows(container)).toEqual(["＋ 新增群演「咖啡」1 人", "👥 咖啡廳客人"]),
    );

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

describe("群演欄吃的是同一套 chip 手感（票券 39 收票）", () => {
  const two = () =>
    render(
      <Host
        initial={[
          { extraId: mintExtraId(), description: "客人", count: 8 },
          { extraId: mintExtraId(), description: "服務生", count: 2 },
        ]}
      />,
    );

  /** 看得見的順序：chip 與輸入框在這一欄裡實際排成什麼樣（`|` ＝ 輸入框）。 */
  const layout = (root: HTMLElement) =>
    [...root.querySelectorAll(".entity-chip, input")].map((el) =>
      el.tagName === "INPUT" ? "|" : (el.textContent?.replace(/[×👥]/gu, "").trim() ?? ""),
    );

  it("拿起中間那一筆，輸入框就停在它原本那一格，看起來還是一顆 chip", () => {
    const { container } = two();
    fireEvent.mouseDown(container.querySelectorAll(".entity-chip")[0]!);

    expect(layout(container)).toEqual(["|", "服務生 x2"]);
    const shell = container.querySelector(".entity-field__input-chip")!;
    expect(shell.querySelector(".entity-chip__mark")?.textContent).toBe("👥");
    expect(shell.querySelector(".entity-chip__remove")).not.toBeNull();
  });

  it("握著一筆時別的 chip 動不得（連 × 一起）", () => {
    const { container } = two();
    fireEvent.mouseDown(container.querySelectorAll(".entity-chip")[0]!);

    const other = container.querySelector(".entity-chip")!;
    expect(other.className).toContain("entity-chip--locked");
    fireEvent.mouseDown(other.querySelector(".entity-chip__remove")!);
    expect(chipTexts(container)).toEqual(["服務生 x2"]);
    expect(container.querySelector("input")!.value).toBe("客人 x8");
  });

  it("清空之後再一次 Backspace 才放手 —— 不會直接跳進前一筆", () => {
    const { container } = two();
    const input = container.querySelector("input")!;
    fireEvent.keyDown(input, { key: "Backspace" }); // 拿起「服務生 x2」
    fireEvent.change(input, { target: { value: "" } });

    fireEvent.keyDown(input, { key: "Backspace" }); // 放手
    expect(chipTexts(container)).toEqual(["客人 x8"]);
    expect(input.value).toBe("");

    fireEvent.keyDown(input, { key: "Backspace" }); // 這一下才輪到前一筆
    expect(input.value).toBe("客人 x8");
  });

  it("點兩批之間那道縫，新的一批就插在那裡", () => {
    const { container } = two();
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__gap--pick")[0]!);
    expect(layout(container)).toEqual(["客人 x8", "|", "服務生 x2"]);

    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "警察 x3、" } });

    expect(chipTexts(container)).toEqual(["客人 x8", "警察 x3", "服務生 x2"]);
  });
});

describe("改一批群演，選單要說它真的在做的事（票券 40）", () => {
  const one = (onChangeExtras?: (extras: ExtraRef[]) => void) =>
    render(
      <Host initial={[{ extraId: "ex_held", description: "路人", count: 3 }]} onChangeExtras={onChangeExtras} />,
    );

  it("握著一批、字改掉了 —— 第一列說的是「改」，不是「新增」", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全 x1" } });

    expect(rows(container)[0]).toBe("✏️ 把「路人 x3」改成「保全 x1」");
  });

  it("只改人數也是同一列，兩邊的人數都讀得到", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x8" } });

    expect(rows(container)[0]).toBe("✏️ 把「路人 x3」改成「路人 x8」");
  });

  it("按下去就是就地改 —— id 不變，指著它的對白不懸空", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x8" } });
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);

    await waitFor(() =>
      expect(committed.at(-1)).toEqual([{ extraId: "ex_held", description: "路人", count: 8 }]),
    );
  });

  it("字沒改時那一列說的是「放回」 —— 沒有東西被改，也沒有東西被新增", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x3" } });

    expect(rows(container)[0]).toBe("↩︎ 放回「路人 x3」");
    expect(rows(container).some((r) => r.includes("另外開一批"))).toBe(false);
  });

  it("另外開一批：原本那批留著，新的一批是另一個 id", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全 x1" } });

    const another = rows(container).findIndex((r) => r.includes("另外開一批"));
    expect(rows(container)[another]).toBe("＋ 另外開一批「保全 x1」 —— 原本的「路人 x3」留著");
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[another]!);

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人 x3", "保全 x1"]));
    const [kept, minted] = committed.at(-1)!;
    expect(kept).toEqual({ extraId: "ex_held", description: "路人", count: 3 });
    expect(minted!.extraId).not.toBe("ex_held");
    expect(minted).toMatchObject({ description: "保全", count: 1 });
  });

  it("另外開一批：放回原本那一格，新的一批緊接在後，游標停在兩顆之後", () => {
    const { container } = render(
      <Host
        initial={[
          { extraId: "ex_a", description: "客人", count: 8 },
          { extraId: "ex_b", description: "服務生", count: 2 },
        ]}
      />,
    );
    /** 看得見的順序（`|` ＝ 輸入框）—— 拿起中間那一筆時，兩批都該站回它原本那一段。 */
    const layout = () =>
      [...container.querySelectorAll(".entity-chip, input")].map((el) =>
        el.tagName === "INPUT" ? "|" : (el.textContent?.replace(/[×👥]/gu, "").trim() ?? ""),
      );

    fireEvent.mouseDown(container.querySelectorAll(".entity-chip")[0]!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "警察 x3" } });
    const another = rows(container).findIndex((r) => r.includes("另外開一批"));
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[another]!);

    expect(layout()).toEqual(["客人 x8", "警察 x3", "|", "服務生 x2"]);
  });

  it("手上沒握著東西時還是「新增」 —— 那一下確實是憑空多一批", () => {
    const { container } = render(<Host />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x3" } });

    expect(rows(container)[0]).toBe("＋ 新增群演「路人」3 人");
    expect(rows(container).some((r) => r.includes("另外開一批"))).toBe(false);
  });
});
