// @vitest-environment jsdom
/**
 * 場次的「首／尾」旗標 —— 使用者回饋 2026-09-03（第五輪）：「場次間的按鈕依然始終呈現」。
 *
 * 成因：CSS 用 `:first-child`／`:last-child` 判斷首尾，但 `ReactNodeViewRenderer` 會替每個
 * node view 包一層 host `<div class="react-renderer node-scene">`，`.scene` 永遠是那層的**唯一**
 * 子元素 —— 兩個偽類對每一場都成立，腳部按鈕於是永遠不收起。位置只有文件知道，所以改由
 * `extensions/scene-numbers` 的 decoration 帶 `isFirst`／`isLast`，node view 掛成 class。
 *
 * 這支鎖的是「只有第一場有 .scene--first、只有最後一場有 .scene--last」，且插入場次後會重算。
 */
import { render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenplayEditor } from "./ScreenplayEditor";

function scene(text: string) {
  return kernelSchema.node("scene", { sceneId: mintSceneId() }, [
    kernelSchema.node("action", null, [kernelSchema.text(text)]),
  ]);
}

function docWithScenes(n: number) {
  return kernelSchema
    .node("doc", null, Array.from({ length: n }, (_, i) => scene(`第 ${i + 1} 場`)))
    .toJSON() as object;
}

/** 每一場的首尾旗標，依文件順序。 */
function flags(container: HTMLElement) {
  return [...container.querySelectorAll(".scene")].map((el) => ({
    first: el.classList.contains("scene--first"),
    last: el.classList.contains("scene--last"),
  }));
}

describe("場次首尾旗標不靠 :first-child／:last-child", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("三場：只有第一場是 first、只有最後一場是 last", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithScenes(3)} />);
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(3));

    expect(flags(container)).toEqual([
      { first: true, last: false },
      { first: false, last: false },
      { first: false, last: true },
    ]);
  });

  it("每個 .scene 都是自己那層 react-renderer 殼的唯一子元素（＝偽類會全中的原因）", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithScenes(3)} />);
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(3));

    for (const el of container.querySelectorAll(".scene")) {
      expect(el.parentElement!.children.length).toBe(1);
      expect(el.matches(":last-child")).toBe(true); // 偽類對每一場都成立 —— 所以不能用它
    }
  });

  it("單場：同時是 first 與 last", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithScenes(1)} />);
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(1));

    expect(flags(container)).toEqual([{ first: true, last: true }]);
  });
});
