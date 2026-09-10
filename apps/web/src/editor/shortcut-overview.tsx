/**
 * 快捷鍵總覽（票券 34 第五輪，使用者要求）。
 *
 * 這個編輯器把很多東西交給了鍵盤 —— 區塊循環、場次簡表的二維導航、下拉的速記鍵、⌘↑↓ 的
 * 出口。**每一顆鍵各自都有理由，但合起來沒有一個地方看得到全部。** 這就是那個地方。
 *
 * 內容來自 `./shortcuts` 那張表（單一事實來源）。這裡只負責怎麼開、怎麼關、長什麼樣。
 *
 * ── 怎麼找得到它 ──────────────────────────────────────────────────
 * 一個只有快捷鍵打得開的快捷鍵說明是笑話，所以有兩條路：畫面左上角常駐一顆很淡的觸發鈕，
 * 以及 **⌘/**（與欄位說明的 ⌥/ 同一顆實體鍵、不同修飾鍵 —— 一個問「這一格是什麼」，
 * 一個問「有哪些鍵」）。
 *
 * 監聽掛在 window 而不是某個節點上：焦點可能在內文、在 chip row 的某個 `<input>`、
 * 或使用者點了空白處掉在 body 上 —— 這顆鍵在哪裡都該有效（同 `EmptyScreenplayPanel`
 * 的理由）。⌘/ 不與任何既有的鍵相撞：`/` 本身是斜線選單，但那顆沒有修飾鍵。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import {
  SHORTCUTS,
  SHORTCUT_OVERVIEW_HINT,
  isShortcutOverviewKey,
} from "./shortcuts";

export function ShortcutOverview() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  /** 開啟前焦點在哪 —— 關閉時要還它（同 `field-info`：不還就等於把焦點丟給 body）。 */
  const returnTo = useRef<HTMLElement | null>(null);

  const openPanel = () => {
    returnTo.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  };

  const closePanel = () => {
    setOpen(false);
    returnTo.current?.focus();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutOverviewKey(event)) {
        event.preventDefault();
        if (open) closePanel();
        else openPanel();
        return;
      }
      // Esc 只在開著的時候是我們的 —— 關著時它屬於選單、面板那些正在浮著的東西。
      if (open && event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // 開啟後把焦點移進面板：Esc 才有地方接，螢幕閱讀器也才讀得到標題與內容。
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="shortcut-overview__trigger"
        aria-keyshortcuts={SHORTCUT_OVERVIEW_HINT}
        aria-expanded={open}
        // 焦點留給使用者原本在做的事 —— 點一下看完就關，不該把游標從稿子上搶走。
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? closePanel() : openPanel())}
      >
        <span className="shortcut-overview__trigger-key">⌘/</span> 快捷鍵
      </button>

      {open && (
        <div className="shortcut-overview__scrim" onMouseDown={closePanel}>
          <div
            ref={panel}
            className="shortcut-overview"
            role="dialog"
            aria-modal="true"
            aria-label="快捷鍵總覽"
            tabIndex={-1}
            // 點面板裡面不該關掉它。
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="shortcut-overview__head">
              <h2 className="shortcut-overview__title">快捷鍵</h2>
              <button type="button" className="shortcut-overview__close" onClick={closePanel}>
                關閉（Esc）
              </button>
            </div>

            <div className="shortcut-overview__groups">
              {SHORTCUTS.map((group) => (
                <section key={group.title} className="shortcut-overview__group">
                  <h3 className="shortcut-overview__group-title">{group.title}</h3>
                  <dl className="shortcut-overview__rows">
                    {group.rows.map((row) => (
                      <div key={`${group.title}:${row.keys.join("+")}:${row.what}`}>
                        <dt>
                          {row.keys.map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                        </dt>
                        <dd>
                          {row.what}
                          {row.when && (
                            <span className="shortcut-overview__when">（{row.when}）</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
