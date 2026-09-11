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
/** 可以操作的那份選單（預覽與唯讀抬頭都不算 —— 它們按不到）。 */
const menuItems = (root: HTMLElement) => [
  ...root.querySelectorAll(
    ".entity-field__menu:not(.entity-field__menu--preview) li:not(.entity-field__menu-hint)",
  ),
];
const rows = (root: HTMLElement) => menuItems(root).map((li) => li.textContent ?? "");
/** 選單頂端那一行唯讀抬頭（票券 40 第二輪）；沒有就是 null。 */
const heldNote = (root: HTMLElement) =>
  root.querySelector(".entity-field__menu-hint")?.textContent ?? null;
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

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人（8）", "服務生（2）"]));
    expect(input.value).toBe("");
  });

  it("沒寫人數就是「若干」—— 系統不憑空生出一個數字（票券 45）", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "服務生" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["服務生（若干）"]));
  });

  it("描述裡的空白留著（多值欄輸入規則）", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳 客人 x8、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳 客人（8）"]));
  });

  it("離開欄位時把還沒切成 chip 的字定案", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "路人 x3" } });
    fireEvent.blur(input);

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（3）"]));
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

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人（8）"]));
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
    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人（8）"]));
  });
});

describe("重新編輯", () => {
  it("點 chip 把**名稱**放回輸入框，改完仍是**同一筆** extraId", async () => {
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
    await waitFor(() => expect(input.value).toBe("咖啡廳客人"));

    fireEvent.change(input, { target: { value: "咖啡廳常客" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // 同一筆 id —— 對白的人物欄可能正指著它，換 id 會讓那句台詞的引用當場懸空。
    // 人數一個字都沒打過：框裡從來沒有它（票券 47）。
    await waitFor(() =>
      expect(committed.at(-1)).toEqual([
        { extraId, description: "咖啡廳常客", count: 8 },
      ]),
    );
  });

  it("空欄位上 Backspace 把最後一筆還原成可編輯文字", async () => {
    const { container } = render(
      <Host initial={[{ extraId: mintExtraId(), description: "客人", count: 8 }]} />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });

    await waitFor(() => expect(input.value).toBe("客人"));
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

    expect(layout(container)).toEqual(["|", "服務生（2）"]);
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
    expect(chipTexts(container)).toEqual(["服務生（2）"]);
    expect(container.querySelector("input")!.value).toBe("客人");
  });

  it("清空之後再一次 Backspace 才放手 —— 不會直接跳進前一筆", () => {
    const { container } = two();
    const input = container.querySelector("input")!;
    fireEvent.keyDown(input, { key: "Backspace" }); // 拿起「服務生（2）」
    fireEvent.change(input, { target: { value: "" } });

    fireEvent.keyDown(input, { key: "Backspace" }); // 放手
    expect(chipTexts(container)).toEqual(["客人（8）"]);
    expect(input.value).toBe("");

    fireEvent.keyDown(input, { key: "Backspace" }); // 這一下才輪到前一筆
    expect(input.value).toBe("客人");
  });

  it("點兩批之間那道縫，新的一批就插在那裡", () => {
    const { container } = two();
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__gap--pick")[0]!);
    expect(layout(container)).toEqual(["客人（8）", "|", "服務生（2）"]);

    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "警察 x3、" } });

    expect(chipTexts(container)).toEqual(["客人（8）", "警察（3）", "服務生（2）"]);
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
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

    // 印的仍是整串前後對照 —— 人數沒動，所以兩邊都是（3）（票券 47）。
    expect(rows(container)[0]).toBe("✏️ 把「路人（3）」改成「保全（3）」");
  });

  it("按下去就是就地改 —— id 不變，指著它的對白不懸空", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });
    fireEvent.mouseDown(menuItems(container)[0]!);

    await waitFor(() =>
      expect(committed.at(-1)).toEqual([{ extraId: "ex_held", description: "保全", count: 3 }]),
    );
  });

  it("字沒改時那一列說的是「不修改，返回」 —— 沒有東西被改，也沒有東西被新增", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人" } });

    expect(rows(container)[0]).toBe("↩︎ 不修改，返回");
    expect(rows(container).some((r) => r.includes("保留"))).toBe(false);
  });

  it("另外開一批：原本那批留著，新的一批是另一個 id", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

    const another = rows(container).findIndex((r) => r.includes("保留"));
    expect(rows(container)[another]).toBe("＋ 新增「保全（3）」群演，保留「路人（3）」");
    fireEvent.mouseDown(menuItems(container)[another]!);

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（3）", "保全（3）"]));
    const [kept, minted] = committed.at(-1)!;
    expect(kept).toEqual({ extraId: "ex_held", description: "路人", count: 3 });
    expect(minted!.extraId).not.toBe("ex_held");
    // 框裡只有名稱，所以另外那一批沿用手上這一批的人數（票券 47）。
    expect(minted).toMatchObject({ description: "保全", count: 3 });
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
    fireEvent.change(container.querySelector("input")!, { target: { value: "警察" } });
    const another = rows(container).findIndex((r) => r.includes("保留"));
    fireEvent.mouseDown(menuItems(container)[another]!);

    expect(layout()).toEqual(["客人（8）", "警察（8）", "|", "服務生（2）"]);
  });

  it("手上沒握著東西時還是「新增」 —— 那一下確實是憑空多一批", () => {
    const { container } = render(<Host />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x3" } });

    expect(rows(container)[0]).toBe("＋ 新增群演「路人」3 人");
    expect(rows(container).some((r) => r.includes("保留"))).toBe(false);
  });

  describe("選單頂端那一行唯讀抬頭", () => {
    it("字還沒改就看得見 —— 它說的是「改的是名稱，數量保留」", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);

      expect(heldNote(container)).toBe(
        "✏️ 正在編輯「路人（3）」，改的是名稱 —— 數量保留，不必手動重寫",
      );
    });

    it("字改過之後還在，印的仍是原本那一批", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

      expect(heldNote(container)).toBe(
        "✏️ 正在編輯「路人（3）」，改的是名稱 —— 數量保留，不必手動重寫",
      );
    });

    it("框裡清空了它也還在 —— 那時說的是下一顆 Backspace 會做什麼", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.change(container.querySelector("input")!, { target: { value: "" } });

      expect(heldNote(container)).toBe("✏️ 正在編輯「路人（3）」，再按一次 Backspace 移除這一批");
    });

    it("它不是一列選項 —— 選不到，Enter 碰不到", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

      expect(container.querySelector(".entity-field__menu-hint")!.getAttribute("role")).toBe(
        "presentation",
      );
      expect(rows(container)[0]).toBe("✏️ 把「路人（3）」改成「保全（3）」");
    });

    it("手上沒握著東西時沒有抬頭", () => {
      const { container } = render(<Host />);
      fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x3" } });

      expect(heldNote(container)).toBeNull();
    });

    it("組字中不出現 —— 那一刻每一顆鍵都還給 IME", () => {
      const { container } = one();
      const input = container.querySelector("input")!;
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: "ㄅㄠ" } });

      expect(heldNote(container)).toBeNull();
    });
  });
});

describe("編輯框裡只有名稱，人數自動保留（票券 47）", () => {
  const one = (extra: Partial<ExtraRef> = {}, onChangeExtras?: (extras: ExtraRef[]) => void) =>
    render(
      <Host
        initial={[
          {
            extraId: "ex_held",
            description: "路人",
            count: 8,
            countValue: { kind: "exact", count: 8 },
            ...extra,
          },
        ]}
        onChangeExtras={onChangeExtras}
      />,
    );

  /** 一進編輯狀態該看到的樣子：框裡只有名稱、整串反白、選單展開（抬頭至少在）。 */
  const expectEditing = (container: HTMLElement) => {
    const input = container.querySelector("input")!;
    expect(input.value).toBe("路人");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, "路人".length]);
    expect(heldNote(container)).not.toBeNull();
  };

  it("點 chip 進編輯狀態：框裡只有名稱，全選、選單展開", async () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);

    await waitFor(() => expectEditing(container));
  });

  it("空欄位 Backspace 退到它 —— 同一個編輯狀態", async () => {
    const { container } = one();
    fireEvent.keyDown(container.querySelector("input")!, { key: "Backspace" });

    await waitFor(() => expectEditing(container));
  });

  it("焦點在 chip 上按 Enter —— 同一個編輯狀態", async () => {
    const { container } = one();
    fireEvent.keyDown(container.querySelector(".entity-chip")!, { key: "Enter" });

    await waitFor(() => expectEditing(container));
  });

  it("直接改文字 ＝ 只改名稱，人數自動留著", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one({}, (e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["保全（8）"]));
    expect(committed.at(-1)).toEqual([
      { extraId: "ex_held", description: "保全", count: 8, countValue: { kind: "exact", count: 8 } },
    ]);
  });

  it("人數不是一個數字時照樣留著 —— 區間不必手動重寫", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one({ count: 3, countValue: { kind: "range", from: 3, to: 5 } }, (e) =>
      committed.push(e),
    );
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    expect(container.querySelector("input")!.value).toBe("路人"); // 括號裡那一段不在框裡
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["保全（3-5）"]));
    expect(committed.at(-1)![0]!.countValue).toEqual({ kind: "range", from: 3, to: 5 });
  });

  it("編輯框**不認** `x8` 尾綴 —— 那幾個字就是名稱的一部分", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one({}, (e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全 x3" } });

    expect(rows(container)[0]).toBe("✏️ 把「路人（8）」改成「保全 x3（8）」");
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["保全 x3（8）"]));
    expect(committed.at(-1)![0]).toMatchObject({ description: "保全 x3", count: 8 });
  });

  it("框裡只剩 `x8`（連描述都沒有）—— 那也是名稱，不是人數", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one({}, (e) => committed.push(e));
    const input = container.querySelector("input")!;
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(input, { target: { value: "x8" } });

    // 沒握著的那一側這一串讀不出一筆群演（沒有描述的人數不知道在數什麼）；
    // 握著時它是一個名稱，而且人數照樣留著。
    expect(rows(container)[0]).toBe("✏️ 把「路人（8）」改成「x8（8）」");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["x8（8）"]));
    expect(committed.at(-1)![0]!.extraId).toBe("ex_held");
  });

  it("字刪光再重打 —— 還握在手上，所以仍是修改（`extraId` 不變）", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one({}, (e) => committed.push(e));
    const input = container.querySelector("input")!;
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "保全" } });

    expect(rows(container)[0]).toBe("✏️ 把「路人（8）」改成「保全（8）」");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["保全（8）"]));
    expect(committed.at(-1)![0]!.extraId).toBe("ex_held");
  });

  it("框裡空著離開欄位 ＝ 放手，那一批就沒了", async () => {
    const { container } = one();
    const input = container.querySelector("input")!;
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => expect(chipTexts(container)).toEqual([]));
    expect(heldNote(container)).toBeNull();
  });
});

describe("「不修改，返回」每一階段都在（票券 42 第 2 條的通則）", () => {
  const one = (onChangeExtras?: (extras: ExtraRef[]) => void) =>
    render(
      <Host
        initial={[{ extraId: "ex_held", description: "路人", count: 8 }]}
        onChangeExtras={onChangeExtras}
      />,
    );

  it("字改過了它仍然在 —— 編劇隨時可能反悔", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

    expect(rows(container)).toEqual([
      "✏️ 把「路人（8）」改成「保全（8）」",
      "＋ 新增「保全（8）」群演，保留「路人（8）」",
      "↩︎ 不修改，返回",
    ]);
  });

  it("按下它 ＝ 整輪作廢：那一批原封回到原位，打的字丟掉", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

    const back = rows(container).findIndex((r) => r.startsWith("↩︎"));
    fireEvent.mouseDown(menuItems(container)[back]!);

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
    expect(committed.at(-1)).toEqual([{ extraId: "ex_held", description: "路人", count: 8 }]);
    expect(container.querySelector("input")!.value).toBe("");
  });

  it("字沒改時只有它一列 —— 不會印兩次同一句話", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人" } });

    expect(rows(container)).toEqual(["↩︎ 不修改，返回"]);
  });

  it("沒握著東西時不出這一列 —— 沒有一輪編輯可以作廢", () => {
    const { container } = render(<Host initial={[]} />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

    expect(rows(container).some((r) => r.startsWith("↩︎"))).toBe(false);
  });
});

describe("框裡空著時「不修改，返回」也在（使用者回報 2026-09-12）", () => {
  const one = (onChangeExtras?: (extras: ExtraRef[]) => void) =>
    render(
      <Host
        initial={[{ extraId: "ex_held", description: "路人", count: 8 }]}
        onChangeExtras={onChangeExtras}
      />,
    );

  /** 握著一批、把字刪光 —— 剩下的是那個 chip 外殼。 */
  const emptied = (onChangeExtras?: (extras: ExtraRef[]) => void) => {
    const { container } = one(onChangeExtras);
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "" } });
    return container;
  };

  it("字刪光了它仍然在 —— 那一刻退路最需要看得見", () => {
    expect(rows(emptied())).toEqual(["↩︎ 不修改，返回"]);
  });

  it("按下它 ＝ 那一批原封回到原位（不是放手）", async () => {
    const committed: ExtraRef[][] = [];
    const container = emptied((e) => committed.push(e));
    fireEvent.mouseDown(menuItems(container)[0]!);

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
    expect(committed.at(-1)).toEqual([{ extraId: "ex_held", description: "路人", count: 8 }]);
  });

  it("抬頭照舊說下一顆 Backspace 會做什麼 —— 兩條路都看得見", () => {
    const container = emptied();
    expect(heldNote(container)).toBe("✏️ 正在編輯「路人（8）」，再按一次 Backspace 移除這一批");
  });

  it("Backspace 仍然是放手 —— 多出來的那一列沒有搶走它", async () => {
    const container = emptied();
    fireEvent.keyDown(container.querySelector("input")!, { key: "Backspace" });

    await waitFor(() => expect(chipTexts(container)).toEqual([]));
    expect(heldNote(container)).toBeNull();
  });

  it("沒握著東西、框又是空的 —— 選單整個不出現", () => {
    const { container } = render(<Host initial={[{ extraId: "ex_a", description: "路人", count: 8 }]} />);
    expect(rows(container)).toEqual([]);
    expect(heldNote(container)).toBeNull();
  });
});

describe("空框上 Enter 與 blur 是兩件事（票券 47 驗收追加）", () => {
  const emptied = (onChangeExtras?: (extras: ExtraRef[]) => void) => {
    const { container } = render(
      <Host
        initial={[{ extraId: "ex_held", description: "路人", count: 8 }]}
        onChangeExtras={onChangeExtras}
      />,
    );
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "" } });
    return container;
  };

  it("Enter 打在看得見的那一列上 —— 空框時那一列是「不修改，返回」", async () => {
    const container = emptied();
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });

    // Enter 是一個選擇，而選單上唯一那一列就是它的意思（同其他階段）。
    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
  });

  it("blur 仍然是放手 —— 那不是選擇，是人走了", async () => {
    const container = emptied();
    fireEvent.blur(container.querySelector("input")!);

    await waitFor(() => expect(chipTexts(container)).toEqual([]));
  });
});
