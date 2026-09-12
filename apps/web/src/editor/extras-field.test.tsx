// @vitest-environment jsdom
/**
 * 群演欄的驗收（票券 09）：多組「描述 x 人數」、跨場次描述**只補字串**、
 * 注音組字期間不動作、重新編輯保住 `extraId`。
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
  cleanup();
});

describe("多組「描述 x 人數」", () => {
  it("頓號分隔，一次打好幾組", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8、服務生 x2、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["咖啡廳客人（8）", "服務生（2）"]));
    expect(input.value).toBe("");
  });

  it("沒寫人數就問一次，空著離開仍然是「若干」（票券 45／49）", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "服務生" } });
    // 第一次 Enter 進第二層（他還沒說人數）；第二層空著 Enter ＝ 第一列的值 ＝ 若干。
    fireEvent.keyDown(input, { key: "Enter" });
    const box = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(".entity-field__count-input");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.keyDown(box, { key: "Enter" });

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
      expect(rows(container)).toEqual(["＋ 新增群演「咖啡」…", "👥 咖啡廳客人"]),
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
      expect(rows(container)).toEqual(["＋ 新增群演「咖啡」…", "👥 咖啡廳服務生"]),
    );
  });

  it("已經打成同一串字時不再列那一列（沒東西可補）", async () => {
    const { container } = render(<Host suggestions={["咖啡廳客人"]} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });

    await waitFor(() => expect(rows(container)).toEqual(["＋ 新增群演「咖啡廳客人（8）」"]));
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
    // 兩個形態一起寫（票券 44 的 ⚠️、票券 48 落實）—— 舊欄位單獨存在時會說謊。
    await waitFor(() =>
      expect(committed.at(-1)).toEqual([
        { extraId, description: "咖啡廳常客", count: 8, countValue: { kind: "exact", count: 8 } },
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
    expect(rows(container)[0]).toBe("✅ 確認：改成「保全（3）」");
  });

  it("按下去就是就地改 —— id 不變，指著它的對白不懸空", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });
    fireEvent.mouseDown(menuItems(container)[0]!);

    await waitFor(() =>
      expect(committed.at(-1)).toEqual([
        { extraId: "ex_held", description: "保全", count: 3, countValue: { kind: "exact", count: 3 } },
      ]),
    );
  });

  it("字沒改時那一列說的是「不修改，返回」 —— 沒有東西被改，也沒有東西被新增", () => {
    const { container } = one();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人" } });

    // 票券 48 在它上面多了一列 `修改數量…`（那是「還要做別的事」，排在「結束」之前）。
    expect(rows(container)).toEqual(["✏️ 修改數量…", "↩︎ 不修改，返回"]);
    expect(rows(container).some((r) => r.includes("保留"))).toBe(false);
  });

  it("另外開一批：原本那批留著，新的一批是另一個 id", async () => {
    const committed: ExtraRef[][] = [];
    const { container } = one((e) => committed.push(e));
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

    const another = rows(container).findIndex((r) => r.includes("另外新增"));
    expect(rows(container)[another]).toBe("＋ 另外新增「保全（3）」群演");
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
    const another = rows(container).findIndex((r) => r.includes("另外新增"));
    fireEvent.mouseDown(menuItems(container)[another]!);

    expect(layout()).toEqual(["客人（8）", "警察（8）", "|", "服務生（2）"]);
  });

  it("手上沒握著東西時還是「新增」 —— 那一下確實是憑空多一批", () => {
    const { container } = render(<Host />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "路人 x3" } });

    expect(rows(container)[0]).toBe("＋ 新增群演「路人（3）」");
    expect(rows(container).some((r) => r.includes("保留"))).toBe(false);
  });

  describe("選單頂端那一行唯讀抬頭", () => {
    // 票券 48 把 47 那句換成編劇逐字指定的措辭 —— 它多說了一件 47 沒說的事：**那要怎麼
    // 改數量**。兩者必須同時上線，所以這兩條的期望值跟著 `修改數量…` 那一列一起改。
    const HEADLINE = "💡 正在編輯「路人」群演，原本數量「3」保留";

    it("字還沒改就看得見 —— 它指得出「那要怎麼改數量」", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);

      expect(heldNote(container)).toBe(HEADLINE);
    });

    it("字改過之後還在，名稱那一段印的仍是原本那一批", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

      expect(heldNote(container)).toBe(HEADLINE);
    });

    it("框裡清空了它也還在 —— 那時說的是下一顆 Backspace 會做什麼", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.change(container.querySelector("input")!, { target: { value: "" } });

      expect(heldNote(container)).toBe("💡 正在編輯「路人（3）」，再按一次 Backspace 移除這一批");
    });

    it("它不是一列選項 —— 選不到，Enter 碰不到", () => {
      const { container } = one();
      fireEvent.mouseDown(container.querySelector(".entity-chip")!);
      fireEvent.change(container.querySelector("input")!, { target: { value: "保全" } });

      expect(container.querySelector(".entity-field__menu-hint")!.getAttribute("role")).toBe(
        "presentation",
      );
      expect(rows(container)[0]).toBe("✅ 確認：改成「保全（3）」");
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

    expect(rows(container)[0]).toBe("✅ 確認：改成「保全 x3（8）」");
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
    expect(rows(container)[0]).toBe("✅ 確認：改成「x8（8）」");
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

    expect(rows(container)[0]).toBe("✅ 確認：改成「保全（8）」");
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
      "✅ 確認：改成「保全（8）」",
      "＋ 另外新增「保全（8）」群演",
      "✏️ 修改數量…",
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

    expect(rows(container)).toEqual(["✏️ 修改數量…", "↩︎ 不修改，返回"]);
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
    expect(rows(emptied())).toEqual(["✏️ 修改數量…", "↩︎ 不修改，返回"]);
  });

  it("按下它 ＝ 那一批原封回到原位（不是放手）", async () => {
    const committed: ExtraRef[][] = [];
    const container = emptied((e) => committed.push(e));
    fireEvent.mouseDown(
      menuItems(container)[rows(container).findIndex((r) => r.startsWith("↩︎"))]!,
    );

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
    expect(committed.at(-1)).toEqual([{ extraId: "ex_held", description: "路人", count: 8 }]);
  });

  it("抬頭照舊說下一顆 Backspace 會做什麼 —— 兩條路都看得見", () => {
    const container = emptied();
    expect(heldNote(container)).toBe("💡 正在編輯「路人（8）」，再按一次 Backspace 移除這一批");
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

  it("Enter 打在**停著的那一列**上 —— 空框時停在第一列（票券 48 之後是「修改數量…」）", async () => {
    const container = emptied();
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });

    // 票券 47 收票時這一列是唯一那一列（於是 Enter ＝ 放回）；票券 48 在它上面多了
    // `修改數量…`，而規則一步都沒退：**Enter 打在選單上停著的那一列**。
    await waitFor(() =>
      expect(container.querySelector(".entity-field__count-input")).not.toBeNull(),
    );
  });

  it("↓ 一格再 Enter 仍然是放回 —— 那一列沒有被搶走，只是不再排第一", async () => {
    const container = emptied();
    const input = container.querySelector("input")!;
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
  });

  it("blur 仍然是放手 —— 那不是選擇，是人走了", async () => {
    const container = emptied();
    fireEvent.blur(container.querySelector("input")!);

    await waitFor(() => expect(chipTexts(container)).toEqual([]));
  });
});

/**
 * 人數走一層子選單（票券 48）。
 *
 * 兩件事在這裡一起被量：**預設值印在看得見的地方**（第一列就是「按下去會得到什麼」），
 * 以及**待定人數是編輯狀態的一部分** —— 挑完退回名稱那一關，doc 一個字都還沒動。
 */
describe("人數子選單（票券 48）", () => {
  /** 可以按的那幾列（人數格那一格不算 —— 它是輸入，不是選項）。 */
  const options = (root: HTMLElement) =>
    [...root.querySelectorAll('.entity-field__menu li[role="option"]')].map(
      (li) => li.textContent ?? "",
    );
  const countBox = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>(".entity-field__count-input");
  const countHint = (root: HTMLElement) =>
    root.querySelector(".entity-field__count-hint")?.textContent ?? null;
  const nameBox = (root: HTMLElement) => root.querySelector<HTMLInputElement>("input")!;

  /** 拿起一批（點 chip）—— 編輯狀態的三個入口是同一條路（票券 47）。 */
  const held = (extra: Partial<ExtraRef> = {}, onChangeExtras?: (e: ExtraRef[]) => void) => {
    const { container } = render(
      <Host
        initial={[{ extraId: "ex_held", description: "路人", count: 8, ...extra }]}
        onChangeExtras={onChangeExtras}
      />,
    );
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    return container;
  };

  /** 按下 `修改數量…` 那一列。 */
  const openCount = (container: HTMLElement) => {
    const at = rows(container).findIndex((r) => r.includes("修改數量"));
    expect(at).toBeGreaterThanOrEqual(0);
    fireEvent.mouseDown(menuItems(container)[at]!);
    return container;
  };

  /** 按下子選單裡某一列（以開頭的字找）。 */
  const pick = (container: HTMLElement, prefix: string) => {
    const at = options(container).findIndex((r) => r.startsWith(prefix));
    expect(at).toBeGreaterThanOrEqual(0);
    fireEvent.mouseDown(
      [...container.querySelectorAll('.entity-field__menu li[role="option"]')][at]!,
    );
  };

  it("`修改數量…` 排在 `↩︎ 不修改，返回` 之前 —— 它是「還要做別的事」，不是「結束」", () => {
    const container = held();
    const list = rows(container);
    expect(list.indexOf("✏️ 修改數量…")).toBeGreaterThanOrEqual(0);
    expect(list.indexOf("✏️ 修改數量…")).toBeLessThan(list.findIndex((r) => r.startsWith("↩︎")));
  });

  it("第一列是 `↰ 不修改數量（8），回上一步`；自由輸入格與「不指定」在它下面", () => {
    const container = openCount(held());

    // 四列，與新增那一側逐列對齊（編劇裁決 2026-09-13：「兩邊都同一套」）。
    expect(options(container)).toEqual([
      "↰ 不修改數量（8），回上一步",
      "不特別指定數量（若干）",
      "↩︎ 不修改，返回",
    ]);
    expect(countBox(container)).not.toBeNull();
  });

  /**
   * 格子排在**第二列**（編劇裁決 2026-09-12）—— 它是進來之後焦點的落點，排在第四列時
   * 那一跳跨過半份選單，看不見它跳去哪了。列序量的是整份選單，`options()` 讀不到格子
   * （它是 `role="presentation"`），所以這一條直接數 `li`。
   */
  it("自由輸入格排在第二列，緊跟著 `↰` —— 焦點只跳一格（票券 48 第二輪）", () => {
    const container = openCount(held());
    const all = [
      ...container.querySelectorAll(".entity-field__menu li:not(.entity-field__menu-hint)"),
    ];

    expect(all[0]?.textContent).toBe("↰ 不修改數量（8），回上一步");
    expect(all[1]?.querySelector(".entity-field__count-input")).not.toBeNull();
    expect(all.map((li) => li.getAttribute("role"))[1]).toBe("presentation");
    expect(all[2]?.textContent).toBe("不特別指定數量（若干）");
  });

  /**
   * 「現在停在哪」整份選單只有一種說法（編劇裁決 2026-09-12）。格子那一列原本靠自己的框線
   * 說，在淺色底上幾乎看不見，而且與別列的反白是兩種語言。
   */
  it("停在格子上時那一列也反白 —— 與其餘各列同一條（票券 48 第二輪）", () => {
    const container = openCount(held());
    const boxRow = container.querySelector(".entity-field__menu-box")!;

    // 進來就停在格子上。
    expect(boxRow.classList.contains("is-active")).toBe(true);

    // ↓ 走開，反白跟著走 —— 它不是永遠亮著的裝飾。
    fireEvent.keyDown(countBox(container)!, { key: "ArrowDown" });
    expect(
      container.querySelector(".entity-field__menu-box")!.classList.contains("is-active"),
    ).toBe(false);
  });

  it("空格子有 placeholder —— 不會讀成「這一列空缺了」（票券 48 第二輪）", () => {
    const container = openCount(held());

    expect(countBox(container)!.placeholder).toBe("輸入人數");
  });

  /**
   * 這一關只有兩條路：打一個數字，或者不說（編劇裁決 2026-09-13）。`1` 那一列（票券 48
   * 原有）與格子裡打一個 `1` 完全重複 —— 兩側一起拿掉。
   */
  it("沒有 `1` 那一列 —— 它與格子裡打一個 `1` 完全重複", () => {
    expect(options(openCount(held()))).not.toContain("1");
    // 原本就是 1 的那一批也一樣（那一列從前在這裡會被判定成重複而不印）。
    expect(options(openCount(held({ count: 1 })))).not.toContain("1");
  });

  it("沒有猜出來的數字階梯 —— `10+／20+／30+／40+` 拿掉了", () => {
    const container = openCount(held());
    expect(options(container).some((r) => /\d\+/.test(r))).toBe(false);
  });

  describe("自由輸入格", () => {
    /** 打一串字、Enter 離開 —— 回傳待定值那一段（抬頭說的就是「數量已更新為什麼」）。 */
    const typed = (value: string) => {
      const container = openCount(held({ count: 1 }));
      fireEvent.change(countBox(container)!, { target: { value } });
      fireEvent.keyDown(countBox(container)!, { key: "Enter" });
      return /數量已更新：(.+)$/.exec(heldNote(container) ?? "")?.[1] ?? null;
    };

    it("`8`", () => expect(typed("8")).toBe("8"));
    it("`3~5`", () => expect(typed("3~5")).toBe("3-5"));
    it("`3-5`", () => expect(typed("3-5")).toBe("3-5"));
    it("`10+`", () => expect(typed("10+")).toBe("10+"));
    it("全形符號一樣認得（`１０＋`）", () => expect(typed("１０＋")).toBe("10+"));
  });

  describe("底下那一行提示永遠有話說", () => {
    it("空著 —— 格式說明", () => {
      expect(countHint(openCount(held()))).toBe("合法：8、3~5、2-6、10+");
    });

    it("讀得出來 —— 預覽，而且跟著框裡的字變", () => {
      const container = openCount(held());
      fireEvent.change(countBox(container)!, { target: { value: "3~5" } });
      expect(countHint(container)).toBe("路人（3-5）");

      fireEvent.change(countBox(container)!, { target: { value: "12" } });
      expect(countHint(container)).toBe("路人（12）");
    });

    it("打到一半 —— 警告，而且說得出現在離開會記成什麼", () => {
      const container = openCount(held());
      fireEvent.change(countBox(container)!, { target: { value: "3~" } });

      expect(countHint(container)).toBe(
        "⚠️ 「3~」還讀不出來 —— 現在離開會記成「路人（8）」",
      );
    });

    it("名稱改過之後預覽跟著新名字走 —— 它說的是「按下去會得到什麼」", () => {
      const container = held();
      fireEvent.change(nameBox(container), { target: { value: "保全" } });
      openCount(container);
      fireEvent.change(countBox(container)!, { target: { value: "3~5" } });

      expect(countHint(container)).toBe("保全（3-5）");
    });
  });

  describe("讀不出來時離開 ＝ 第一列的值（修改時是原值，不是「若干」）", () => {
    /** 離開的三種走法，結果必須一樣。 */
    const leaving = {
      "空著 Enter": (c: HTMLElement) => fireEvent.keyDown(countBox(c)!, { key: "Enter" }),
      "打到一半 Enter": (c: HTMLElement) => {
        fireEvent.change(countBox(c)!, { target: { value: "3~" } });
        fireEvent.keyDown(countBox(c)!, { key: "Enter" });
      },
      "點到外面": (c: HTMLElement) => {
        fireEvent.change(countBox(c)!, { target: { value: "3~" } });
        fireEvent.blur(countBox(c)!);
      },
    };

    for (const [how, leave] of Object.entries(leaving)) {
      it(`${how} —— 仍然是 8，不是「若干」`, async () => {
        // 名稱先改過，這樣第一列才有話說（人數也沒動的話那一下什麼都沒改）——
        // 順便證明這條路上名稱與人數互不干擾。
        const container = held();
        fireEvent.change(nameBox(container), { target: { value: "保全" } });
        openCount(container);
        leave(container);

        // 回到名稱那一關，而且人數一個字都沒被改掉。
        await waitFor(() => expect(countBox(container)).toBeNull());
        // 點到外面**就是走了**，那一下連這一輪編輯一起收（同名稱框的 blur）；Enter 那兩條
        // 只是退回名稱那一關，還要再按一次才定案。三者取的人數值是同一個 —— 那才是這一條
        // 在量的東西。
        if (chipTexts(container).length === 0) {
          fireEvent.keyDown(nameBox(container), { key: "Enter" });
        }
        await waitFor(() => expect(chipTexts(container)).toEqual(["保全（8）"]));
      });
    }
  });

  it("點回名稱框 —— 只退一階，焦點不被搶回去，這一輪編輯還在", async () => {
    const container = held();
    openCount(container);
    fireEvent.change(countBox(container)!, { target: { value: "2" } });
    // 焦點搬去欄位裡的另一個框（`relatedTarget` 還在這一欄裡）。
    fireEvent.blur(countBox(container)!, { relatedTarget: nameBox(container) });

    await waitFor(() => expect(countBox(container)).toBeNull());
    expect(chipTexts(container)).toEqual([]); // 還握在手上，doc 上還沒有它
    expect(rows(container)[0]).toBe("✅ 確認：改成「路人（2）」");
  });

  it("挑完人數退回描述那一關，名稱還能接著改，游標停在字尾（不整串反白）", async () => {
    const container = openCount(held());
    pick(container, "不特別指定數量（若干）");

    await waitFor(() => expect(countBox(container)).toBeNull());
    const box = nameBox(container);
    expect(box.value).toBe("路人");
    // 整串反白的話下一顆鍵就把它清光，等於白挑一次人數（同票券 37 對 ⌘Z 的裁決）。
    expect([box.selectionStart, box.selectionEnd]).toEqual([2, 2]);

    fireEvent.change(box, { target: { value: "保全" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(chipTexts(container)).toEqual(["保全（若干）"]));
  });

  it("只改人數、沒碰名稱時第一列印 `✅ 確認：改成「路人（2）」`", () => {
    const container = openCount(held());
    fireEvent.change(countBox(container)!, { target: { value: "2" } });
    fireEvent.keyDown(countBox(container)!, { key: "Enter" });

    expect(rows(container)[0]).toBe("✅ 確認：改成「路人（2）」");
  });

  describe("抬頭兩態（編劇逐字指定 2026-09-12）", () => {
    it("還沒改數量 —— 說「原本數量保留」，並指出那條路在哪", () => {
      const container = held();
      fireEvent.change(nameBox(container), { target: { value: "保全" } });

      expect(heldNote(container)).toBe(
        "💡 正在編輯「路人」群演，原本數量「8」保留",
      );
    });

    it("改過數量 —— 人數那一段跟著待定值走，名稱那一段仍是原值", () => {
      const container = openCount(held());
      pick(container, "不特別指定數量（若干）");
      fireEvent.change(nameBox(container), { target: { value: "保全" } });

      expect(heldNote(container)).toBe(
        "💡 正在編輯「路人」群演，數量已更新：若干",
      );
    });
  });

  describe("`↰` 與 `↩︎` 是兩列，不合併", () => {
    it("`↰` 退一階，名稱那一側的待定改動留著", async () => {
      const container = held();
      fireEvent.change(nameBox(container), { target: { value: "保全" } });
      openCount(container);
      pick(container, "↰");

      await waitFor(() => expect(countBox(container)).toBeNull());
      expect(nameBox(container).value).toBe("保全");
      expect(rows(container)[0]).toBe("✅ 確認：改成「保全（8）」");
    });

    it("`↩︎` 整輪作廢 —— 待定人數與名稱改動一起丟，手上那一筆原封放回", async () => {
      const committed: ExtraRef[][] = [];
      const container = held({}, (e) => committed.push(e));
      fireEvent.change(nameBox(container), { target: { value: "保全" } });
      openCount(container);
      fireEvent.change(countBox(container)!, { target: { value: "2" } });
      fireEvent.keyDown(countBox(container)!, { key: "Enter" });
      openCount(container);
      pick(container, "↩︎");

      await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
      expect(committed.at(-1)).toEqual([{ extraId: "ex_held", description: "路人", count: 8 }]);
      expect(nameBox(container).value).toBe("");
    });

    it("Esc 等同 `↰` —— 退一階，字留著", async () => {
      const container = held();
      fireEvent.change(nameBox(container), { target: { value: "保全" } });
      openCount(container);
      fireEvent.keyDown(countBox(container)!, { key: "Escape" });

      await waitFor(() => expect(countBox(container)).toBeNull());
      expect(nameBox(container).value).toBe("保全");
      expect(rows(container).some((r) => r.includes("修改數量"))).toBe(true);
    });
  });

  it("點那一行提示不算「人走了」 —— 它就貼在框底下一格（code review 2026-09-12）", () => {
    const container = openCount(held());
    // `fireEvent` 回 false ＝ 這一下被 `preventDefault` 擋了，所以框不會 blur、整輪不會定案。
    expect(fireEvent.mouseDown(container.querySelector(".entity-field__count-hint")!)).toBe(false);
    // 格子本身不擋 —— 擋了連游標都點不進去。
    expect(fireEvent.mouseDown(countBox(container)!)).toBe(true);
  });

  it("在子選單裡按 `↩︎` —— 焦點回到名稱框，不會掉到 body（code review 2026-09-12）", async () => {
    const container = openCount(held());
    pick(container, "↩︎");

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
    expect(document.activeElement).toBe(nameBox(container));
  });

  it("再進子選單時第一列跟的是**待定值** —— 那才是「現在的樣子」", () => {
    const container = openCount(held());
    fireEvent.change(countBox(container)!, { target: { value: "2" } });
    fireEvent.keyDown(countBox(container)!, { key: "Enter" });
    openCount(container);

    expect(options(container)[0]).toBe("↰ 不修改數量（2），回上一步");
  });

  it("待定人數在按下確認之前**不寫回 doc**", () => {
    const committed: ExtraRef[][] = [];
    const container = held({}, (e) => committed.push(e));
    const before = committed.length; // 拿起來那一下本來就寫過一次（chip 從 doc 上撤掉）
    openCount(container);
    fireEvent.change(countBox(container)!, { target: { value: "2" } });
    fireEvent.keyDown(countBox(container)!, { key: "Enter" });

    expect(committed.length).toBe(before);
    expect(rows(container)[0]).toBe("✅ 確認：改成「路人（2）」");
  });

  it("↑↓ 停得進人數格，也走得出去 —— Enter 打在停著的那一格上", async () => {
    const container = openCount(held());
    const box = countBox(container)!;
    // 預設停在格子上（打完的字才是這一刻要的東西）。格子排在第二列（票券 48 第二輪），
    // 所以 ↑ 一格是第一列 `↰ 不修改數量（8），回上一步` —— 走得出去，而且退得回描述那一關。
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect(countBox(container)).toBeNull());
    expect(nameBox(container).value).toBe("路人");

    // 再走一次：這次往下走到最後一列 `↩︎ 不修改，返回`，那一批原封放回。
    // 列序是 `↰`／格子／`不特別指定數量（若干）`／`↩︎`，格子在第二列，所以 ↓ 兩格到底。
    const again = countBox(openCount(container))!;
    fireEvent.keyDown(again, { key: "ArrowDown" });
    fireEvent.keyDown(again, { key: "ArrowDown" });
    fireEvent.keyDown(again, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（8）"]));
  });
});

/**
 * 新增也走兩層（票券 49）—— **與編輯共用同一套子選單**，只是第一列沒有原數量可印。
 *
 * 規則收斂成一句：**沒說人數就問一次。**
 */
describe("新增：沒說人數就問一次（票券 49）", () => {
  const countBox = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>(".entity-field__count-input");
  const countHint = (root: HTMLElement) =>
    root.querySelector(".entity-field__count-hint")?.textContent ?? null;
  const nameBox = (root: HTMLElement) => root.querySelector<HTMLInputElement>("input")!;
  const options = (root: HTMLElement) =>
    [...root.querySelectorAll('.entity-field__menu li[role="option"]')].map(
      (li) => li.textContent ?? "",
    );

  /** 打一串字、Enter —— 回傳那一格（進了第二層就不是 null）。 */
  const typeThenEnter = (typed: string, onChangeExtras?: (e: ExtraRef[]) => void) => {
    const { container } = render(<Host onChangeExtras={onChangeExtras} />);
    fireEvent.change(nameBox(container), { target: { value: typed } });
    fireEvent.keyDown(nameBox(container), { key: "Enter" });
    return container;
  };

  it("沒說人數 → 進第二層；列的順序與編輯那側逐列對齊（驗收回饋 2026-09-13）", () => {
    const container = typeThenEnter("路人");

    expect(countBox(container)).not.toBeNull();
    expect(options(container)).toEqual([
      "↰ 回上一步，改群演名稱",
      "不特別指定數量（若干）",
      "✕ 放棄新增群演",
    ]);
    // 格子在第二列 —— 與編輯那側同一格（`options` 只收得到 `role="option"` 那幾列）。
    const all = [
      ...container.querySelectorAll(".entity-field__menu li:not(.entity-field__menu-hint)"),
    ];
    expect(all[1]?.querySelector(".entity-field__count-input")).not.toBeNull();
    // `↩︎ 不修改，返回` 不在這一側：手上沒握著任何一批，沒有一輪編輯可以作廢。
    expect(options(container).some((r) => r.startsWith("↩︎"))).toBe(false);
    expect(chipTexts(container)).toEqual([]); // 這一刻還沒有任何一筆定案
  });

  /**
   * **高亮跟著游標走**（驗收回饋 2026-09-13）。中間有一版讓新增停在 `若干` 那一列上，好讓
   * 「什麼都不做會記成什麼」有個看得見的位置 —— 結果是游標在格子裡、高亮在別的列上，一份
   * 選單出現兩個重點。預設值改用那一列自己的措辭說（`不特別指定數量（若干）`）。
   */
  it("預設焦點與高亮都在格子上 —— 兩側同一條", () => {
    const container = typeThenEnter("路人");

    expect(document.activeElement).toBe(countBox(container));
    expect(
      container.querySelector(".entity-field__menu-box")!.classList.contains("is-active"),
    ).toBe(true);
    // 選單裡不會有第二個亮著的地方。
    expect(container.querySelectorAll(".entity-field__menu li.is-active").length).toBe(1);
  });

  it("`1` 那一列只在編輯那側 —— 新增時它與格子裡打一個 `1` 完全重複", () => {
    expect(options(typeThenEnter("路人"))).not.toContain("1");
  });

  it("抬頭說的是現在在回答哪一關（編劇逐字指定 2026-09-13）", () => {
    // 與編輯那側的 `修改數量（原本是 8）` 同一個句型：動詞 ＋ 對象 ＋ 數量。
    expect(heldNote(typeThenEnter("路人"))).toBe("💡 選擇群演「路人」數量");
  });

  it("`↰ 回上一步` 退回名稱那一關，打的字留著 —— 與 Esc 同一條路", async () => {
    const container = typeThenEnter("路人");
    const at = options(container).indexOf("↰ 回上一步，改群演名稱");
    fireEvent.mouseDown(
      [...container.querySelectorAll('.entity-field__menu li[role="option"]')][at]!,
    );

    await waitFor(() => expect(countBox(container)).toBeNull());
    expect(nameBox(container).value).toBe("路人");
    expect(chipTexts(container)).toEqual([]); // 還沒有任何一筆定案
  });

  it("`✕ 放棄新增群演` 連名稱一起清掉 —— 手上沒有東西可以原封放回", async () => {
    const container = typeThenEnter("路人");
    const at = options(container).indexOf("✕ 放棄新增群演");
    fireEvent.mouseDown(
      [...container.querySelectorAll('.entity-field__menu li[role="option"]')][at]!,
    );

    await waitFor(() => expect(countBox(container)).toBeNull());
    expect(nameBox(container).value).toBe("");
    expect(chipTexts(container)).toEqual([]);
  });

  it("那一行提示照舊三態，`fallback` 是若干（新增時他確實沒說）", () => {
    const container = typeThenEnter("路人");
    expect(countHint(container)).toBe("合法：8、3~5、2-6、10+");

    fireEvent.change(countBox(container)!, { target: { value: "3~5" } });
    expect(countHint(container)).toBe("路人（3-5）");

    fireEvent.change(countBox(container)!, { target: { value: "3~" } });
    expect(countHint(container)).toBe(
      "⚠️ 「3~」還讀不出來 —— 現在離開會記成「路人（若干）」",
    );
  });

  it("第二層打一個數字就定案", async () => {
    const container = typeThenEnter("路人");
    fireEvent.change(countBox(container)!, { target: { value: "1" } });
    fireEvent.keyDown(countBox(container)!, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（1）"]));

    const another = typeThenEnter("保全");
    fireEvent.change(countBox(another)!, { target: { value: "3~5" } });
    fireEvent.keyDown(countBox(another)!, { key: "Enter" });
    await waitFor(() => expect(chipTexts(another)).toEqual(["保全（3-5）"]));
  });

  it("`不特別指定數量（若干）` 按下去也定案 —— 與空著離開同一個結果", async () => {
    const container = typeThenEnter("路人");
    const at = options(container).indexOf("不特別指定數量（若干）");
    fireEvent.mouseDown(
      [...container.querySelectorAll('.entity-field__menu li[role="option"]')][at]!,
    );

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（若干）"]));
  });

  it("點到外面 ＝ 若干 —— `blur` 擋不住，三種離開法同一個結果", async () => {
    const container = typeThenEnter("路人");
    fireEvent.blur(countBox(container)!, { relatedTarget: document.body });

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（若干）"]));
  });

  it("一次打完的路留著 —— 新增框**認尾綴**，人數就在那串字裡（使用者裁決 2026-09-12）", async () => {
    for (const [typed, chip] of [
      ["路人 x8", "路人（8）"],
      ["路人（3-5）", "路人（3-5）"],
      ["路人 10+", "路人（10+）"],
      // 括號裡的「若干」也是他自己說的 —— 值上與「沒說」分不開，但那一串字分得開。
      ["路人（若干）", "路人（若干）"],
    ]) {
      const container = typeThenEnter(typed!);
      expect(countBox(container)).toBeNull(); // 一層都不必問
      await waitFor(() => expect(chipTexts(container)).toEqual([chip]));
      cleanup();
    }
  });

  it("`路人 8` 不是人數（票券 43）—— 整串是名字，於是它也要被問一次", async () => {
    const container = typeThenEnter("路人 8");

    expect(countBox(container)).not.toBeNull();
    fireEvent.keyDown(countBox(container)!, { key: "Enter" });
    await waitFor(() => expect(chipTexts(container)).toEqual(["路人 8（若干）"]));
  });

  it("⚠️ 第一層打完就走（blur）**不問**，直接記成若干 —— 那正是問題的預設答案", async () => {
    // `blur` 擋不住：點到外面就是走了。這一刻把焦點搶回來去開一個子選單，是這一欄唯一會
    // 跟他搶滑鼠的地方；而結果與走完兩層空著離開一模一樣，所以問了也問不出新東西。
    const { container } = render(<Host />);
    fireEvent.change(nameBox(container), { target: { value: "路人" } });
    fireEvent.blur(nameBox(container));

    await waitFor(() => expect(chipTexts(container)).toEqual(["路人（若干）"]));
    expect(countBox(container)).toBeNull();
  });

  it("第一列的 `…` 與它按下去做的事讀同一個答案（`willAskCount`）", () => {
    // 印 `…` 就一定會問，印整筆就一定直接定案 —— 兩者分頭寫時遲早對不上。
    const asked = typeThenEnter("路人");
    expect(countBox(asked)).not.toBeNull();
    cleanup();

    const straight = render(<Host />).container;
    fireEvent.change(nameBox(straight), { target: { value: "路人 x8" } });
    expect(rows(straight)[0]).toBe("＋ 新增群演「路人（8）」");
    fireEvent.keyDown(nameBox(straight), { key: "Enter" });
    expect(countBox(straight)).toBeNull();
    expect(chipTexts(straight)).toEqual(["路人（8）"]);
  });

  it("Esc 退回第一層，打的字留著 —— 兩層之間走得回頭", async () => {
    const container = typeThenEnter("路人");
    fireEvent.keyDown(countBox(container)!, { key: "Escape" });

    await waitFor(() => expect(countBox(container)).toBeNull());
    expect(nameBox(container).value).toBe("路人");
    expect(chipTexts(container)).toEqual([]);
  });

  it("名稱框空著 Enter 什麼都不做 —— 沒有名字就沒有一批人要問人數", () => {
    const { container } = render(<Host />);
    fireEvent.keyDown(nameBox(container), { key: "Enter" });

    expect(countBox(container)).toBeNull();
    expect(chipTexts(container)).toEqual([]);
  });

  it("放手之後打字，兩階段就回來了 —— 那時沒有握著任何一批", async () => {
    const { container } = render(
      <Host initial={[{ extraId: "ex_held", description: "路人", count: 8 }]} />,
    );
    // 拿起來、放手（空框上的 Backspace）—— 這一場從此沒有這一批。
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(nameBox(container), { target: { value: "" } });
    fireEvent.keyDown(nameBox(container), { key: "Backspace" });
    await waitFor(() => expect(chipTexts(container)).toEqual([]));

    fireEvent.change(nameBox(container), { target: { value: "保全" } });
    expect(rows(container)[0]).toBe("＋ 新增群演「保全」…");
    fireEvent.keyDown(nameBox(container), { key: "Enter" });

    expect(countBox(container)).not.toBeNull();
    expect(options(container)).toEqual([
      "↰ 回上一步，改群演名稱",
      "不特別指定數量（若干）",
      "✕ 放棄新增群演",
    ]);
  });

  it("握著一批時走的仍然是編輯那一套 —— 第一列印的是原數量", () => {
    const { container } = render(
      <Host initial={[{ extraId: "ex_held", description: "路人", count: 8 }]} />,
    );
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(nameBox(container), { target: { value: "保全" } });
    // 編輯框不認尾綴（票券 47），Enter 打在第一列上 ＝ 就地改，不問人數。
    fireEvent.keyDown(nameBox(container), { key: "Enter" });

    expect(countBox(container)).toBeNull();
    expect(chipTexts(container)).toEqual(["保全（8）"]);
  });
});
