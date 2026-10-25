/**
 * 專案卡右上角的「⋯」選單（票券 72）：主區卡是「封存／刪除」，已封存卡是「取消封存／刪除」。
 *
 * 開啟時焦點進第一列，上下鍵移動、Esc 收起並把焦點還給「⋯」，點外面就收（`dismissOnOutsidePointer`，
 * 跟編輯器裡的選單同一條線）。選一列之前選單先收起 —— 那一列做的事可能讓這張卡整個消失。
 */
"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { dismissOnOutsidePointer } from "@/editor/dismiss-on-outside-pointer";

export type CardMenuRow = {
  label: string;
  /** `byKeyboard`：這一下是鍵盤觸發的（Enter／空白鍵）—— 卡片要是因此消失，焦點得有個去處。 */
  run: (byKeyboard: boolean) => void;
};

export function CardMenu({ title, rows }: { title: string; rows: CardMenuRow[] }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return dismissOnOutsidePointer(
      () => menu.current,
      () => setOpen(false),
      () => toggle.current,
    );
  }, [open]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  const move = (step: number) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + step + items.length) % items.length]?.focus();
  };

  return (
    <div className="card-menu">
      <button
        ref={toggle}
        type="button"
        className="hub-card__action card-menu__toggle"
        aria-label={`「${title}」的更多動作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menu}
          className="card-menu__list"
          role="menu"
          aria-label={`「${title}」的更多動作`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              role="menuitem"
              // 鍵盤（Enter／空白鍵）觸發的 click 沒有點擊次數：`detail` 是 0。
              onClick={(event: MouseEvent) => {
                setOpen(false);
                row.run(event.detail === 0);
              }}
            >
              {row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
