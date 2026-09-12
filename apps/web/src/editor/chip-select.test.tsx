// @vitest-environment jsdom
/**
 * ChipSelect —— chip row 的自訂下拉（比照 slash 選單外觀，取代原生 <select>）。
 * 使用者回饋 2026-09-03。
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ChipSelect } from "./chip-select";

function Host({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <ChipSelect
      className="scene__chip-control"
      placeholder="時間"
      value={v}
      options={["日", "夜", "晨", "昏"]}
      onChange={setV}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("ChipSelect", () => {
  it("未選時觸發鈕顯示 placeholder，選單預設關閉", () => {
    const { container } = render(<Host />);
    const btn = container.querySelector("button")!;
    expect(btn.textContent).toBe("時間");
    expect(container.querySelector(".chip-select__menu")).toBeNull();
  });

  it("鍵盤：↓ 開啟 → ↓ 移動 → Enter 選取", () => {
    const { container } = render(<Host />);
    const btn = container.querySelector("button")!;
    btn.focus();

    fireEvent.keyDown(btn, { key: "ArrowDown" }); // 開，active=第 0 列（回到未選）
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
    fireEvent.keyDown(btn, { key: "ArrowDown" }); // active → "日"
    fireEvent.keyDown(btn, { key: "Enter" });

    expect(btn.textContent).toBe("日");
    expect(container.querySelector(".chip-select__menu")).toBeNull();
  });

  it("Enter／Space 也開得了選單（↓ 不是唯一的入口）", () => {
    const { container } = render(<Host />);
    const btn = container.querySelector("button")!;
    btn.focus();

    fireEvent.keyDown(btn, { key: "Enter" });
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
    fireEvent.keyDown(btn, { key: "Escape" });
    fireEvent.keyDown(btn, { key: " " });
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
  });

  // 票券 34（修訂）—— chip row 是二維格線，關著時的 ↑←→ 是走到隔壁那一格。
  // ↓ 是唯一的例外：那顆鍵歸選單（使用者裁決 2026-09-10，見 chip-select.tsx 檔頭）。
  describe("選單關著時的格線導航", () => {
    const navHost = (nav: {
      left?: () => boolean;
      right?: () => boolean;
      up?: () => boolean;
    }) =>
      render(
        <ChipSelect
          placeholder="時間"
          value=""
          options={["日", "夜"]}
          onChange={() => {}}
          nav={nav}
        />,
      );

    it.each([
      ["ArrowUp", "up"],
      ["ArrowLeft", "left"],
      ["ArrowRight", "right"],
    ] as const)("%s → nav.%s，並 preventDefault", (key, dir) => {
      let went = 0;
      const { container } = navHost({ [dir]: () => Boolean((went += 1)) });
      const btn = container.querySelector("button")!;
      btn.focus();

      const cancelled = !fireEvent.keyDown(btn, { key });
      expect(went).toBe(1);
      expect(cancelled).toBe(true); // 別讓它再變成一次文件裡的游標移動
      expect(container.querySelector(".chip-select__menu")).toBeNull(); // 導航不開選單
    });

    it("↓ 仍然是開選單，不走 nav", () => {
      let went = 0;
      const { container } = navHost({
        up: () => Boolean((went += 1)),
        left: () => Boolean((went += 1)),
      });
      const btn = container.querySelector("button")!;
      btn.focus();

      fireEvent.keyDown(btn, { key: "ArrowDown" });
      expect(container.querySelector(".chip-select__menu")).not.toBeNull();
      expect(went).toBe(0);
    });

    it("那個方向回 false（沒有去處）時，鍵也原封還給瀏覽器", () => {
      const { container } = navHost({ up: () => false, left: () => false, right: () => false });
      const btn = container.querySelector("button")!;
      btn.focus();

      for (const key of ["ArrowUp", "ArrowLeft", "ArrowRight"]) {
        expect(fireEvent.keyDown(btn, { key })).toBe(true);
      }
    });

    it("沒給那個方向時原封還給瀏覽器", () => {
      const { container } = render(<Host />); // 完全沒有 nav
      const btn = container.querySelector("button")!;
      btn.focus();

      for (const key of ["ArrowUp", "ArrowLeft", "ArrowRight"]) {
        expect(fireEvent.keyDown(btn, { key })).toBe(true); // 沒被 preventDefault
      }
      expect(container.querySelector(".chip-select__menu")).toBeNull();
    });
  });

  // 使用者回饋 2026-09-10（第四輪）：「可以快速拿到要的選項…畢竟要選的值在選單底端，
  // 還是要往下按幾次」。速記鍵用的是列舉本來就有的劇本術語，不是另外發明的鍵。
  describe("速記鍵：一顆字母直接拿到那個值", () => {
    const TERMS = { 日: "DAY", 夜: "NIGHT", 晨: "DAWN", 昏: "DUSK" } as const;
    const termHost = (onChange: (v: string) => void = () => {}) =>
      render(
        <ChipSelect
          placeholder="時間"
          value=""
          options={["日", "夜", "晨", "昏"]}
          terms={TERMS}
          onChange={onChange}
        />,
      );

    it("選單關著時按 n → 直接就是「夜」，選單沒有打開過", () => {
      const picked: string[] = [];
      const { container } = termHost((v) => picked.push(v));
      const btn = container.querySelector("button")!;
      btn.focus();

      const cancelled = !fireEvent.keyDown(btn, { key: "n" });
      expect(picked).toEqual(["夜"]);
      expect(cancelled).toBe(true);
      expect(container.querySelector(".chip-select__menu")).toBeNull();
    });

    it("撞在一起的那幾個（DAY／DAWN／DUSK）靠重複按同一顆鍵循環", () => {
      const picked: string[] = [];
      const { container } = termHost((v) => picked.push(v));
      const btn = container.querySelector("button")!;
      btn.focus();

      fireEvent.keyDown(btn, { key: "d" });
      fireEvent.keyDown(btn, { key: "d" });
      fireEvent.keyDown(btn, { key: "d" });
      fireEvent.keyDown(btn, { key: "d" }); // 繞回去
      expect(picked).toEqual(["日", "晨", "昏", "日"]);
    });

    it("換一顆字母 ＝ 更長的前綴（du → 昏）", () => {
      const picked: string[] = [];
      const { container } = termHost((v) => picked.push(v));
      const btn = container.querySelector("button")!;
      btn.focus();

      fireEvent.keyDown(btn, { key: "d" });
      fireEvent.keyDown(btn, { key: "u" });
      expect(picked).toEqual(["日", "昏"]);
    });

    it("接不下去的字母就從它自己重新開始（dn → 夜）", () => {
      const picked: string[] = [];
      const { container } = termHost((v) => picked.push(v));
      const btn = container.querySelector("button")!;
      btn.focus();

      fireEvent.keyDown(btn, { key: "d" });
      fireEvent.keyDown(btn, { key: "n" });
      expect(picked).toEqual(["日", "夜"]);
    });

    it("沒有命中的字母原封還給瀏覽器", () => {
      const picked: string[] = [];
      const { container } = termHost((v) => picked.push(v));
      const btn = container.querySelector("button")!;
      btn.focus();

      expect(fireEvent.keyDown(btn, { key: "z" })).toBe(true);
      expect(picked).toEqual([]);
    });

    it("選單開著時速記鍵只移動高亮，定案仍然是 Enter", () => {
      const picked: string[] = [];
      const { container } = termHost((v) => picked.push(v));
      const btn = container.querySelector("button")!;
      btn.focus();

      fireEvent.keyDown(btn, { key: "ArrowDown" }); // 開選單
      fireEvent.keyDown(btn, { key: "n" });
      expect(picked).toEqual([]); // 還沒定案
      const active = container.querySelector(".chip-select__menu li.is-active")!;
      expect(active.textContent).toContain("夜");

      fireEvent.keyDown(btn, { key: "Enter" });
      expect(picked).toEqual(["夜"]);
    });

    // 選單只比 chip 寬一點點，印整串術語會把它撐歪（使用者回饋 2026-09-10 第四輪之二）。
    // 那一顆鍵就夠了；術語的說明在 ⓘ 的框裡（見 `field-info.tsx`）。
    it("選單列上印的是那一顆鍵，不是整串術語", () => {
      const { container } = termHost();
      fireEvent.click(container.querySelector("button")!);
      const keys = [...container.querySelectorAll(".chip-select__key")].map((e) => e.textContent);
      expect(keys).toEqual(["(d)", "(n)", "(d)", "(d)"]);
      expect(container.querySelector(".chip-select__menu")!.textContent).not.toContain("DAY");
    });

    it("沒給 terms 就沒有速記鍵（字母原封還給瀏覽器）", () => {
      const { container } = render(<Host />);
      const btn = container.querySelector("button")!;
      btn.focus();
      expect(fireEvent.keyDown(btn, { key: "d" })).toBe(true);
    });
  });

  it("Esc 關閉選單且不改值", () => {
    const { container } = render(<Host initial="夜" />);
    const btn = container.querySelector("button")!;
    btn.focus();
    fireEvent.keyDown(btn, { key: "ArrowDown" }); // 開
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(container.querySelector(".chip-select__menu")).toBeNull();
    expect(btn.textContent).toBe("夜");
  });

  it("Tab 關閉選單且不 preventDefault（焦點自然往下一個 chip）", () => {
    const { container } = render(<Host />);
    const btn = container.querySelector("button")!;
    btn.focus();
    fireEvent.keyDown(btn, { key: "ArrowDown" }); // 開
    // fireEvent.keyDown 回傳 false 代表事件被 preventDefault。Tab 不該被攔。
    const notCancelled = fireEvent.keyDown(btn, { key: "Tab" });
    expect(notCancelled).toBe(true);
    expect(container.querySelector(".chip-select__menu")).toBeNull();
  });

  it("滑鼠：點選單項目即選取；點「回到未選」清空", () => {
    const { container } = render(<Host initial="日" />);
    const btn = container.querySelector("button")!;
    fireEvent.click(btn); // 開
    const clearRow = container.querySelector<HTMLLIElement>(".chip-select__menu li")!;
    // 第 0 列是「還沒填」那個狀態，其後才是值。
    expect(clearRow.textContent).toBe("待定");
    fireEvent.mouseDown(clearRow);
    expect(btn.textContent).toBe("時間"); // 清空 → 觸發鈕退回欄位名
  });

  // 兩邊刻意不同一個字（使用者提問 2026-09-10 第五輪）：觸發鈕是 chip row 上唯一寫著
  // 這一欄叫什麼的地方；選單裡那一列則是一個可選的狀態，該用狀態的名字。
  it("觸發鈕寫欄位名、選單第一列寫「待定」——「還沒填」不靠同一個字說兩次", () => {
    const { container } = render(<Host />);
    const btn = container.querySelector("button")!;
    expect(btn.textContent).toBe("時間");

    fireEvent.click(btn);
    const rows = [...container.querySelectorAll(".chip-select__menu li")].map((li) => li.textContent);
    expect(rows[0]).toBe("待定");
    expect(rows).not.toContain("時間"); // 欄位名不該出現在值的清單裡
  });
});

describe("寬度固定，不隨選到的值伸縮", () => {
  it("--chip-chars ＝ placeholder 與所有選項裡最長的字數（最長的選項不會被截掉）", () => {
    const { getByRole, rerender } = render(
      <ChipSelect value="" options={["內景", "外景", "內外景", "雜景"]} placeholder="內外" onChange={() => {}} />,
    );
    const button = getByRole("button");
    expect(button.style.getPropertyValue("--chip-chars")).toBe("3"); // 「內外景」

    // 選到最短的值，寬度基準不變 —— chip row 不會因此重排。
    rerender(
      <ChipSelect value="雜景" options={["內景", "外景", "內外景", "雜景"]} placeholder="內外" onChange={() => {}} />,
    );
    expect(getByRole("button").style.getPropertyValue("--chip-chars")).toBe("3");
  });

  it("時間：選項都是一個字，基準退回 placeholder 的長度", () => {
    const { getByRole } = render(
      <ChipSelect value="" options={["日", "夜", "晨", "昏"]} placeholder="時間" onChange={() => {}} />,
    );
    expect(getByRole("button").style.getPropertyValue("--chip-chars")).toBe("2");
  });
});
