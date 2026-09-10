/**
 * chip row 的下拉選單 —— 比照 `/` 斜線選單的外觀（使用者回饋 2026-09-03），不用原生
 * `<select>`：原生控制項的字級被作業系統壓縮、外觀無法對齊 §7.11 的 chip 視覺。
 *
 * 值域是固定封閉列舉（時間／內外），沒有自由輸入、沒有 IME 疑慮。空字串 ＝「未選」，
 * 顯示 placeholder；選單第一列是「回到未選」。
 *
 * 純鍵盤可用：關閉時 Enter／Space 開啟；開啟時 ↑↓ 移動、Enter／Space 選、Esc 關、
 * Tab 關閉且**不** `preventDefault`（讓焦點自然往下一個 chip —— §7.1 焦點串接）。外層
 * `.scene__chips` 的 `swallowTab` 仍負責擋 Tab 冒泡到 BlockCycle。
 *
 * ⚠️ **關閉時的 ↑←→ 是 chip row 的格線導航**（`nav`，票券 34 修訂）—— chip row 在畫面上是
 * 二維的（見 editor.css：內外｜時間｜地點 一排，登場人物、群演各自一排），方向鍵就照著版面
 * 走到隔壁那一格。這一格是 `<button>`、沒有游標，所以 ←→ 直接跳；輸入框那三格要游標貼著
 * 字首／字尾才跳（`nodes/scene` 的 `chipNavHandler`）—— **要改這套語意，兩處都得改。**
 *
 * **Enter ＝ 這一格好了，去下一格**（使用者回饋 2026-09-10 第三輪），與輸入框那三格同一顆鍵
 * —— 所以**開選單只剩 Space 與 ↓**。`⌘↑`／`⌘↓` 是離開整排的出口（見 `./chip-nav`）。
 *
 * **↓ 是唯一的例外：它留給選單**（使用者裁決 2026-09-10）。選單本來就往下展，那顆鍵歸它比
 * 歸導航直覺；要往下走就先 → 到地點格再 ↓。反過來 ↑ 不開選單 —— 第一排需要一顆「回上一場」
 * 的鍵，而「↑ 開一個往下展的選單」本來就是原生慣例的怪癖，捨掉不心疼。
 */
"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { ChipNav } from "./chip-nav";
import { HELP_KEY_HINT } from "./field-info";

type Props = {
  /** 目前值；空字串 ＝ 未選。 */
  value: string;
  /** 可選值（不含「未選」那一項）。 */
  options: readonly string[];
  /** 未選時顯示的字，也是選單裡「回到未選」那一列的字，並作為無障礙標籤。 */
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
  /** 欄位說明的 id（`FieldInfo` 給的）。有它就一併宣告 ⌥/ —— 見 `field-info.tsx` 檔頭。 */
  describedBy?: string;
  /**
   * 選單關著時的格線導航（票券 34）—— 隔壁那一格在哪，由 chip row 決定，這裡只負責按鍵。
   * 沒給的方向就原封還給瀏覽器。**`down` 不會被用到**：那顆鍵歸選單（見檔頭）。
   */
  nav?: ChipNav;
};

export const ChipSelect = forwardRef<HTMLButtonElement, Props>(function ChipSelect(
  { value, options, placeholder, onChange, className, describedBy, nav },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // 全部可選列：第 0 列是「回到未選」（空字串），其後是各列舉值。
  const rows = ["", ...options];

  // 控制項寬度**固定**，不隨選到什麼而伸縮（否則整條 chip row 每選一次就重排）。基準是
  // 「placeholder 與所有選項裡最長的那個」的字數，所以最長的選項也不會被截掉。
  // 使用者回饋 2026-09-03。
  const widthInChars = Math.max(...[placeholder, ...options].map((s) => [...s].length));

  // 點到元件外就關閉。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, rows.indexOf(value)));
    setOpen(true);
  };

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Tab") {
      setOpen(false);
      return; // 不 preventDefault —— 焦點自然往下一個 chip
    }
    // 回傳 false ＝ 這個方向這一刻沒有去處（第一場沒有上一場），那顆鍵原封還給瀏覽器。
    const fire = (go: () => boolean) => {
      if (go() === false) return;
      e.preventDefault();
      e.stopPropagation(); // 別讓它冒泡到 .ProseMirror 被 keymap 再當成一次游標移動
    };

    if (!open) {
      // ⌘↑／⌘↓ ＝ 一路走到底，直接離開整排（見 ./chip-nav）。
      if (e.metaKey || e.ctrlKey) {
        const exit =
          e.key === "ArrowDown" ? nav?.exitDown : e.key === "ArrowUp" ? nav?.exitUp : undefined;
        if (exit) fire(exit);
        return;
      }
      // Enter ＝ 這一格好了，去下一格 —— 與輸入框那三格同一顆鍵（使用者回饋 2026-09-10
      // 第三輪）。開選單因此只剩 Space 與 ↓；沒有下一格可去時 Enter 仍然是開選單。
      if (e.key === "Enter" && nav?.right) {
        fire(nav.right);
        return;
      }
      // ↓ 也在這裡 —— 它是開選單的鍵，不是導航的鍵（見檔頭）。
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
        return;
      }
      const go =
        e.key === "ArrowUp"
          ? nav?.up
          : e.key === "ArrowLeft"
            ? nav?.left
            : e.key === "ArrowRight"
              ? nav?.right
              : undefined;
      if (go) fire(go);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(rows[active] ?? "");
    }
  };

  return (
    <div className="chip-select" ref={rootRef}>
      <button
        type="button"
        ref={ref}
        className={className}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={placeholder}
        aria-describedby={describedBy}
        aria-keyshortcuts={describedBy ? HELP_KEY_HINT : undefined}
        style={{ "--chip-chars": widthInChars } as CSSProperties}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {value || placeholder}
      </button>
      {open && (
        <ul className="chip-select__menu" role="listbox" aria-label={placeholder}>
          {rows.map((row, i) => (
            <li
              key={row || "—"}
              role="option"
              aria-selected={row === value}
              className={i === active ? "is-active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(row);
              }}
            >
              {row || placeholder}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
