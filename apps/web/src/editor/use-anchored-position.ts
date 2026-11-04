/**
 * 把一個浮層釘在某個元素旁邊 —— `anchoredPosition` 的 DOM 那一側（票券 33）。
 *
 * 規則在 DESIGN.md 的 **The One Placement Rule**，座標運算在 `anchored-position.ts`；這裡只負責
 * 量尺寸、寫座標、跟著捲動重算。浮層要配 `position: fixed`（座標是視窗座標）。
 *
 * 座標直接寫進 `style`，不經過 React state：每次重繪都要重量（列數一變高度就變），經過 state
 * 等於每次重繪都多一輪重繪。layout effect 在上畫面之前跑完，所以不會先在舊位置閃一下。
 *
 * 上下都放不下時，可用高度寫成 CSS 變數 `--anchored-room`；每個浮層的 CSS 自己決定怎麼用它
 * （`max-block-size: min(<自己的上限>, var(--anchored-room, …))`）—— JS 不知道各自的上限是多少。
 *
 * ⚠️ 祖先只要有 transform／filter／contain 就會變成 fixed 的包含塊（見 editor.css slash 選單那段）。
 */
"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import { anchoredPosition, VIEWPORT_MARGIN, type CaretRect } from "./anchored-position";

type Options = {
  /** 浮層掛著的時候才量；關著時什麼都不做、也不掛捲動監聽。 */
  active: boolean;
  /** 浮層至少與錨點一樣寬（欄位底下的選單）—— `fixed` 之下 CSS 的 `100%` 指的是視窗。 */
  matchWidth?: boolean;
};

/**
 * `anchor` 給元素（欄位、對白區塊）或直接給一個視窗座標的 rect（slash 選單的游標，Tiptap
 * suggestion 的 `clientRect()`）。給 `null` ＝ 錨點一時不在畫面上：浮層藏起來，比留在舊座標上
 * 假裝還貼著它好。
 */
export function useAnchoredPosition(
  floating: RefObject<HTMLElement | null>,
  anchor: () => Element | CaretRect | null | undefined,
  { active, matchWidth = false }: Options,
) {
  const place = () => {
    const el = floating.current;
    if (!el) return;
    const at = anchor();
    if (!at) {
      el.style.visibility = "hidden";
      return;
    }
    el.style.visibility = "";
    const rect = at instanceof Element ? at.getBoundingClientRect() : at;
    const viewport = {
      // `documentElement.clientWidth/Height` 才是扣掉捲軸的可視區；`innerWidth` 會讓靠右夾限的
      // 浮層躲到捲軸底下，吃掉留的那 8px。
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    // 量之前先回到「沒被擺過」的狀態：
    // - fixed 元素的可用寬度從它當下的 `left` 算到視窗右緣 —— 停在右邊量，會量到偏窄、偏高的
    //   尺寸，翻不翻邊就判錯了。
    // - 上一次的限高也要解除，否則量到的是被壓過的高度，「放得下」永遠成立。
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.removeProperty("--anchored-room");
    // 寬度先定下來再量高度 —— 寬度會影響換行，換行會影響高度。不超出視窗（左右各留邊距）。
    if (matchWidth)
      el.style.minInlineSize = `${Math.min(rect.right - rect.left, viewport.width - VIEWPORT_MARGIN * 2)}px`;
    const size = el.getBoundingClientRect();
    const { top, left, maxHeight } = anchoredPosition(rect, size, viewport);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    if (maxHeight != null) el.style.setProperty("--anchored-room", `${maxHeight}px`);
  };
  // 監聽器只綁一次，但呼叫的永遠是這一次重繪的 `place`（錨點 getter 可能換了）。
  const latest = useRef(place);
  latest.current = place;

  // 每次重繪都重量：選單的列數、說明的長短都會改變尺寸。
  useLayoutEffect(() => {
    if (active) latest.current();
  });

  useLayoutEffect(() => {
    if (!active) return;
    const onMove = () => latest.current();
    // capture 才收得到編輯器內層容器的捲動（打字時的 typewriter 捲動也走這裡）。
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [active]);
}
