/**
 * `SceneMenu` —— 點場次號打開的選單（§7.1「點場次號 SX → 選單」）。
 *
 * 票券 11 只放「刪除」那一列：刪主場次一併刪子場次，**不彈對話框**（§4.4）—— 配套是兩件事：
 * 標籤自己寫明數量（「刪除本場（含 2 個子場次）」），⌘Z 一步整棵回來（子樹是一個節點，`sceneId`
 * 一起回來）。搬移／對調兩列歸拖曳那張票（13）。
 *
 * 場次號本身仍是 decoration：不可選、不進 content flow、不進 tab 序、`aria-hidden`（不變式 G）。
 * 它只多了一件事 —— 吃得到滑鼠，點下去開這個選單。
 */
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { dismissOnOutsidePointer } from "./dismiss-on-outside-pointer";

/** 刪除那一列的字 —— 子樹會一起消失時，數量寫在標籤上，按之前就看得到。 */
export function deleteSceneLabel(isSubscene: boolean, subscenes: number): string {
  if (isSubscene) return "刪除這個子場次";
  return subscenes > 0 ? `刪除本場（含 ${subscenes} 個子場次）` : "刪除本場";
}

type Row = { readonly key: string; readonly label: string; readonly run: () => void };

export function SceneMenu({ rows, onClose }: { rows: readonly Row[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // 開啟的那一刻焦點進選單，鍵盤就能直接 Enter／Esc。
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => dismissOnOutsidePointer(() => ref.current, onClose), [onClose]);

  const pick = (row: Row | undefined) => {
    onClose();
    row?.run();
  };

  return (
    <div
      ref={ref}
      className="scene-menu"
      role="menu"
      tabIndex={-1}
      contentEditable={false}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          const step = e.key === "ArrowDown" ? 1 : -1;
          setActive((i) => (i + step + rows.length) % rows.length);
        } else if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          pick(rows[active]);
        }
      }}
    >
      {rows.map((row, i) => (
        <button
          key={row.key}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={i === active ? "is-active" : ""}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            pick(row);
          }}
        >
          {row.label}
        </button>
      ))}
    </div>
  );
}
