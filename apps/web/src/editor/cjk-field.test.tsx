// @vitest-environment jsdom
/**
 * §7.6 / 驗收項 3 —— 中文注音輸入：組字期間只更新本地狀態、`compositionend` 才回寫。
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CjkField } from "./cjk-field";

afterEach(cleanup);

function Harness({ onCommit }: { onCommit: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <CjkField
      aria-label="f"
      value={value}
      onCommit={(v) => {
        setValue(v);
        onCommit(v);
      }}
    />
  );
}

describe("CjkField", () => {
  it("組字期間的 input 事件不回寫，compositionend 才回寫一次", () => {
    const onCommit = vi.fn();
    const { getByLabelText } = render(<Harness onCommit={onCommit} />);
    const input = getByLabelText("f") as HTMLInputElement;

    fireEvent.compositionStart(input);
    // 注音組字：一連串 input 事件（ㄊ → ㄊㄞ → 台）
    fireEvent.change(input, { target: { value: "ㄊ" } });
    fireEvent.change(input, { target: { value: "ㄊㄞ" } });
    fireEvent.change(input, { target: { value: "台" } });
    expect(onCommit).not.toHaveBeenCalled(); // 文件不被回寫

    fireEvent.compositionEnd(input, { target: { value: "台" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("台");
  });

  it("非組字狀態下 input 事件照常回寫", () => {
    const onCommit = vi.fn();
    const { getByLabelText } = render(<Harness onCommit={onCommit} />);
    const input = getByLabelText("f") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "A" } });
    expect(onCommit).toHaveBeenCalledWith("A");
  });
});
