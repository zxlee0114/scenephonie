// @vitest-environment jsdom
/**
 * ChipSelect —— chip row 的自訂下拉（比照 slash 選單外觀，取代原生 <select>）。
 * 使用者回饋 2026-09-03。
 */
import { fireEvent, render } from "@testing-library/react";
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
  document.body.innerHTML = "";
});

describe("ChipSelect", () => {
  it("未選時觸發鈕顯示 placeholder，選單預設關閉", () => {
    const { container } = render(<Host />);
    const btn = container.querySelector("button")!;
    expect(btn.textContent).toBe("時間");
    expect(container.querySelector(".chip-select__menu")).toBeNull();
  });

  it("鍵盤：ArrowDown 開啟 → ArrowDown 移動 → Enter 選取", () => {
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

  it("Esc 關閉選單且不改值", () => {
    const { container } = render(<Host initial="夜" />);
    const btn = container.querySelector("button")!;
    btn.focus();
    fireEvent.keyDown(btn, { key: "Enter" }); // 開
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
    // 第 0 列是「回到未選」（顯示 placeholder），其後才是值。
    expect(clearRow.textContent).toBe("時間");
    fireEvent.mouseDown(clearRow);
    expect(btn.textContent).toBe("時間"); // 清空 → 顯示 placeholder
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
