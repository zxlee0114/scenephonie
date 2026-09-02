/**
 * chip row 的下拉選單 —— 比照 `/` 斜線選單的外觀（使用者回饋 2026-09-03），不用原生
 * `<select>`：原生控制項的字級被作業系統壓縮、外觀無法對齊 §7.11 的 chip 視覺。
 *
 * 值域是固定封閉列舉（時間／內外），沒有自由輸入、沒有 IME 疑慮。空字串 ＝「未選」，
 * 顯示 placeholder；選單第一列是「回到未選」。
 *
 * 純鍵盤可用：關閉時 ↑↓ 或 Enter／Space 開啟；開啟時 ↑↓ 移動、Enter／Space 選、Esc 關、
 * Tab 關閉且**不** `preventDefault`（讓焦點自然往下一個 chip —— §7.1 焦點串接）。外層
 * `.scene__chips` 的 `swallowTab` 仍負責擋 Tab 冒泡到 BlockCycle。
 */
"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

type Props = {
  /** 目前值；空字串 ＝ 未選。 */
  value: string;
  /** 可選值（不含「未選」那一項）。 */
  options: readonly string[];
  /** 未選時顯示的字，也是選單裡「回到未選」那一列的字，並作為無障礙標籤。 */
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
};

export const ChipSelect = forwardRef<HTMLButtonElement, Props>(function ChipSelect(
  { value, options, placeholder, onChange, className },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // 全部可選列：第 0 列是「回到未選」（空字串），其後是各列舉值。
  const rows = ["", ...options];

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
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
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
