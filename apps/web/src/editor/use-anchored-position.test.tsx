// @vitest-environment jsdom
/**
 * 錨定浮層的 DOM 接線（票券 33）。
 *
 * 座標運算本身在 `anchored-position.test.ts`；這裡守的是**接線**：量的是哪一個元素、捲動之後
 * 有沒有重算、寬度有沒有跟著錨點。jsdom 不排版，所以兩個元素的 rect 都是餵進去的。
 */
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAnchoredPosition } from "./use-anchored-position";

type Rect = { top: number; left: number; width: number; height: number };

/** 讓一個元素的 `getBoundingClientRect()` 回傳指定的視窗座標。 */
function placeAt(el: Element, r: Rect) {
  el.getBoundingClientRect = () =>
    ({
      ...r,
      bottom: r.top + r.height,
      right: r.left + r.width,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

let anchorRect: Rect;
const FLOATING = { top: 0, left: 0, width: 240, height: 200 };

function Harness({ active = true, matchWidth = false }: { active?: boolean; matchWidth?: boolean }) {
  const anchor = useRef<HTMLDivElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  useAnchoredPosition(floating, () => {
    if (anchor.current) placeAt(anchor.current, anchorRect);
    return anchor.current;
  }, { active, matchWidth });
  return (
    <>
      <div data-testid="anchor" ref={anchor} />
      {active && (
        <div
          data-testid="floating"
          ref={(el) => {
            floating.current = el;
            if (el) placeAt(el, FLOATING);
          }}
        />
      )}
    </>
  );
}

const root = document.documentElement;
beforeEach(() => {
  Object.defineProperty(root, "clientWidth", { configurable: true, value: 1200 });
  Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 });
  anchorRect = { top: 100, left: 300, width: 160, height: 30 };
});
afterEach(() => {
  cleanup();
  delete (root as { clientWidth?: number }).clientWidth;
  delete (root as { clientHeight?: number }).clientHeight;
});

describe("useAnchoredPosition", () => {
  it("開在錨點下方、貼齊錨點起始邊（視窗座標）", () => {
    const { getByTestId } = render(<Harness />);
    const el = getByTestId("floating");
    // 錨點底 130 ＋ 6 的間隔。
    expect(el.style.top).toBe("136px");
    expect(el.style.left).toBe("300px");
  });

  it("錨點貼近視窗下緣時翻到上方（場次很長、一路往下寫的那種情境）", () => {
    anchorRect = { top: 700, left: 300, width: 160, height: 30 };
    const { getByTestId } = render(<Harness />);
    // 700 - 6 - 200。
    expect(getByTestId("floating").style.top).toBe("494px");
  });

  it("頁面捲動之後重新對位 —— 不留在舊座標上", () => {
    const { getByTestId } = render(<Harness />);
    anchorRect = { top: 400, left: 300, width: 160, height: 30 };
    act(() => {
      // 編輯器內層容器的捲動不會冒泡到 window，要靠 capture 收。
      getByTestId("anchor").dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("floating").style.top).toBe("436px");
  });

  it("matchWidth：至少與錨點一樣寬", () => {
    const { getByTestId } = render(<Harness matchWidth />);
    expect(getByTestId("floating").style.minInlineSize).toBe("160px");
  });
});
