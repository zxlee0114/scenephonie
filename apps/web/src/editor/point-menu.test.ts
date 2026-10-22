/**
 * 定點選單往哪裡長（使用者驗收 2026-10-22）：外面（錨點左邊）有空間就往外長，不遮區塊內容；
 * 放不下才放到錨點下方；碰到可見範圍的底就往上翻。
 */
import { describe, expect, it } from "vitest";

import { placeMenu } from "./point-menu";

// 編輯區的可見範圍；把手在內容邊左側一點。
const bounds = { left: 200, top: 0, right: 1400, bottom: 800 };
const handle = { left: 500, right: 516, top: 300, bottom: 320 };
const size = { width: 180, height: 120 };

describe("placeMenu", () => {
  it("錨點左邊放得下：往外長，右緣貼著錨點左邊、頂端對齊錨點", () => {
    const at = placeMenu(handle, size, bounds, { outside: true });
    expect(at.side).toBe("outside");
    expect(at.x + size.width).toBeLessThanOrEqual(handle.left);
    expect(at.x).toBeGreaterThanOrEqual(bounds.left);
    expect(at.y).toBe(handle.top);
  });

  it("左邊放不下（視窗窄、側欄佔掉）：放到錨點下方，不超出右緣", () => {
    const at = placeMenu({ ...handle, left: 300, right: 316 }, size, bounds, { outside: true });
    expect(at.side).toBe("below");
    expect(at.y).toBeGreaterThanOrEqual(handle.bottom);
    expect(at.x + size.width).toBeLessThanOrEqual(bounds.right);
  });

  it("往外長但下面不夠高：往上挪，整個選單留在可見範圍裡", () => {
    const at = placeMenu({ ...handle, top: 760, bottom: 780 }, size, bounds, { outside: true });
    expect(at.side).toBe("outside");
    expect(at.y + size.height).toBeLessThanOrEqual(bounds.bottom);
  });

  it("放在下方但下面不夠高：翻到錨點上方", () => {
    const at = placeMenu({ left: 300, right: 316, top: 760, bottom: 780 }, size, bounds, { outside: true });
    expect(at.side).toBe("above");
    expect(at.y + size.height).toBeLessThanOrEqual(760);
  });

  it("不要求往外（放下的那一點）：直接長在那一點的右下", () => {
    const point = { left: 700, right: 700, top: 300, bottom: 300 };
    const at = placeMenu(point, size, bounds, { outside: false });
    expect(at.side).toBe("below");
    expect(at.x).toBe(700);
  });
});
