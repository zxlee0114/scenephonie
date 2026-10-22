/**
 * 定點選單（票券 13）—— 浮在某個錨點旁、由 plugin 或 node view 打開的 `SceneMenu`。三種用法：
 * - **點把手**（區塊、群組的 ⠿）：選起那個節點，列出能對它做的事；
 * - **點場次號**（場次的把手）：草稿標記、刪除這一場（§7.1）；
 * - **降級時問種類**：主場次拖進別場 ＝ 變成子場次，而 `種類` 必填、系統不代填（ADR-0006）。用詞與
 *   `/` 選單、區塊逃生口相同（「改成插入戲 ／ 改成接續」，CONTEXT.md），不預設任何一種。
 *
 * **往外長**（使用者驗收 2026-10-22）：錨點左邊（頁邊那一側）放得下就放那裡，不遮區塊內容；放不下
 * 才放到錨點下方，碰到可見範圍的底就翻上去（`placeMenu`）。出現與收起各有一段短的淡入淡出；收起時
 * React 已經把它拿掉了，所以留一個複本播完再刪。減少動態效果時兩段都不播。
 *
 * 按 Esc 或點外面 ＝ 取消；再點一次同一個錨點 ＝ 收起。跟 `SlashMenu` 一樣掛在編輯器旁邊。
 */
"use client";

import { useLayoutEffect, useRef } from "react";

import { requestStore } from "./request-store";
import { SceneMenu, type MenuRow } from "./scene-menu";
import { scrollParentOf, visibleBoundsOf } from "./scroll-parent";

export interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export type MenuSide = "outside" | "below" | "above";

/** 選單與錨點的間距、與可見範圍邊緣的最小距離（px）。 */
const GAP = 12;
const MARGIN = 8;

/**
 * 選單的左上角放哪。`outside` ＝ 先試錨點左邊（頂端對齊錨點），放不下再走下方／上方；
 * 錨點是一個點（放下的位置）時不往外，直接長在它右下。
 */
export function placeMenu(
  anchor: Rect,
  size: { readonly width: number; readonly height: number },
  bounds: Rect,
  { outside }: { readonly outside: boolean },
): { x: number; y: number; side: MenuSide } {
  const clampX = (x: number) => Math.max(bounds.left + MARGIN, Math.min(x, bounds.right - MARGIN - size.width));
  const clampY = (y: number) => Math.max(bounds.top + MARGIN, Math.min(y, bounds.bottom - MARGIN - size.height));
  if (outside) {
    const x = anchor.left - GAP - size.width;
    if (x >= bounds.left + MARGIN) return { x, y: clampY(anchor.top), side: "outside" };
  }
  const x = clampX(anchor.left);
  const below = anchor.bottom + GAP;
  if (below + size.height <= bounds.bottom - MARGIN) return { x, y: below, side: "below" };
  const above = anchor.top - GAP - size.height;
  if (above >= bounds.top + MARGIN) return { x, y: above, side: "above" };
  return { x, y: clampY(below), side: "below" };
}

/** 錨點：一個元素（把手、場次號），或一個視窗座標（放下的那一點）。 */
export type Anchor = HTMLElement | { readonly x: number; readonly y: number };

export interface PointMenuRequest {
  readonly anchor: Anchor;
  readonly rows: readonly MenuRow[];
  /** 選單收起（選了一列、Esc、點外面、再點一次錨點）時 —— 通常是把焦點還給編輯器。 */
  readonly onClose?: () => void;
}

export const pointMenus = requestStore<PointMenuRequest>();

/** 收起目前的選單（並通知開它的人）。 */
export function closePointMenu(): void {
  const request = pointMenus.get();
  if (!request) return;
  pointMenus.set(null);
  request.onClose?.();
}

/** 這個元素是不是目前選單的錨點 —— 點它的那一下是「收起」。 */
export const isMenuAnchor = (el: Element | null): boolean => !!el && pointMenus.get()?.anchor === el;

const anchorElement = (anchor: Anchor) => (anchor instanceof HTMLElement ? anchor : null);

const motionAllowed = () =>
  typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 收起的淡出：React 已經把選單拿掉，留一個不吃事件的複本播完再刪。 */
function fadeOut(menu: HTMLElement, host: HTMLElement | null) {
  if (!host || !motionAllowed()) return;
  const ghost = menu.cloneNode(true) as HTMLElement;
  ghost.classList.add("point-menu--leaving");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  host.append(ghost);
  const remove = () => ghost.remove();
  ghost.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, 400); // 動畫沒跑（分頁在背景）也要收掉
}

/** 每一個請求一個 key：換了請求就換一個新的選單（重新定位、重新淡入、焦點回到第一列）。 */
const keys = new WeakMap<PointMenuRequest, number>();
let nextKey = 0;
const keyOf = (request: PointMenuRequest) => {
  if (!keys.has(request)) keys.set(request, (nextKey += 1));
  return keys.get(request)!;
};

export function PointMenu() {
  const request = pointMenus.use();
  const ref = useRef<HTMLDivElement>(null);

  // 畫出來之前量好大小、決定位置（layout effect：使用者看不到它先出現在 0,0 再跳過去）。
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!request || !menu) return;
    const anchorEl = anchorElement(request.anchor);
    const anchor = anchorEl?.getBoundingClientRect() ?? {
      left: (request.anchor as { x: number }).x,
      right: (request.anchor as { x: number }).x,
      top: (request.anchor as { y: number }).y,
      bottom: (request.anchor as { y: number }).y,
    };
    const bounds = visibleBoundsOf(scrollParentOf(anchorEl ?? document.body));
    const { width, height } = menu.getBoundingClientRect();
    const at = placeMenu(anchor, { width, height }, bounds, { outside: !!anchorEl });
    menu.style.left = `${at.x}px`;
    menu.style.top = `${at.y}px`;
    menu.dataset.side = at.side;
    menu.style.visibility = "visible";
    // 錨點（⠿）在選單開著時一直看得到，滑鼠離開那一行也不會不見。
    anchorEl?.classList.add("is-menu-anchor");
    const host = menu.parentElement;
    return () => {
      anchorEl?.classList.remove("is-menu-anchor");
      fadeOut(menu, host);
    };
  }, [request]);

  if (!request) return null;
  return (
    <div key={keyOf(request)} ref={ref} className="point-menu" style={{ visibility: "hidden" }}>
      <SceneMenu anchor={anchorElement(request.anchor)} onClose={closePointMenu} rows={request.rows} />
    </div>
  );
}
