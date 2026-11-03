/**
 * 把一個浮層釘在某個元素旁邊 —— `anchoredPosition` 的 DOM 那一側（票券 33）。
 *
 * 規則在 DESIGN.md 的 **The One Placement Rule**，座標運算在 `anchored-position.ts`；這裡只負責
 * 量尺寸、寫座標、跟著捲動重算。浮層要配 `position: fixed`（座標是視窗座標）。
 *
 * 座標直接寫進 `style`，不經過 React state：每次重繪都要重量（列數一變高度就變），經過 state
 * 等於每次重繪都多一輪重繪。layout effect 在上畫面之前跑完，所以不會先在舊位置閃一下。
 *
 * ⚠️ 祖先只要有 transform／filter／contain 就會變成 fixed 的包含塊（見 editor.css slash 選單那段）。
 */
"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import { anchoredPosition } from "./anchored-position";

type Options = {
  /** 浮層掛著的時候才量；關著時什麼都不做、也不掛捲動監聽。 */
  active: boolean;
  /** 浮層至少與錨點一樣寬（欄位底下的選單）—— `fixed` 之下 CSS 的 `100%` 指的是視窗。 */
  matchWidth?: boolean;
};

export function useAnchoredPosition(
  floating: RefObject<HTMLElement | null>,
  anchor: () => Element | null | undefined,
  { active, matchWidth = false }: Options,
) {
  const place = () => {
    const el = floating.current;
    const at = anchor();
    if (!el || !at) return;
    const rect = at.getBoundingClientRect();
    // 寬度先定下來再量高度 —— 寬度會影響換行，換行會影響高度。
    if (matchWidth) el.style.minInlineSize = `${rect.width}px`;
    const size = el.getBoundingClientRect();
    const { top, left } = anchoredPosition(rect, size, {
      // `documentElement.clientWidth/Height` 才是扣掉捲軸的可視區（同 slash 選單）。
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    });
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
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
    // capture 才收得到編輯器內層容器的捲動。
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [active]);
}
