/**
 * 欄位選單最下面那一列 `ⓘ 關於地點 (⌥/)`（票 101）—— 欄位那一側的共用規則。
 *
 * `FieldInfo`（`field-info.tsx`）握著說明面板，經由 context 給出要印的字、打開的動作、以及
 * 「回去」的接口；這裡是**握著選單的那一側**：說明列什麼時候出現、怎麼被走到、打開與關掉的
 * 那兩下欄位要做什麼。實體欄位（地點、登場人物）與群演欄逐條同一套規則，原本各寫一份
 * （票 101 code review 指出的重複），收在 `useMenuInfoRow`。
 *
 * 內外／時間（`ChipSelect`）不走這支 hook：它的列是封閉列舉，說明列就是「第 n 列」，用索引
 * 表示高亮最自然；它只共用那一列的 JSX（`InfoRowItem`）。
 *
 * 規則（票 101 結論）：
 * - 有別的列時說明列排最後；空欄位只有**指標點進來**（`pointed`）才開一份只有它的選單。
 * - **永不預選**（`hot` 只有 ↓／↑ 走到或滑鼠移上去才亮）。
 * - 選了就由說明面板**取代**選單；返回列／Esc 回到打開前的那一層，高亮停在原處。
 * - 讀說明不算離開欄位；說明被點走（焦點不在這一格了）才補跑離開的收尾。
 */
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { useFieldInfoRow, type FieldInfoRow } from "./field-info";

type Options = {
  /** 整格（判斷焦點還在不在這一格）。 */
  field: RefObject<HTMLElement | null>;
  /** 欄位這一刻放得下說明列嗎 —— 沒在組字、沒被 Esc 收掉、在對的那一層。 */
  allowed: boolean;
  /** 選單裡有沒有說明列以外的東西（候選、提示）。沒有的話只有指標點進來才開。 */
  hasContent: boolean;
  /** 說明取代選單：收起一般選單（待確認面板留著 —— 問題還沒答）。 */
  collapseMenu: () => void;
  /** 打開說明那一刻，畫面上有沒有選單或待確認面板（有才放返回列）。 */
  menuShown: () => boolean;
  /** 打開那一刻拍下欄位自己的選單狀態，回傳把它放回去的動作。點進來與高亮由這裡還原。 */
  captureMenu: () => () => void;
  /** 說明被點走、焦點不在這一格了 —— 補跑離開欄位的收尾（字定案、放手、歸位）。 */
  leave: () => void;
};

export type MenuInfoRow = {
  /** 這一刻要放的說明列；null ＝ 不放。 */
  row: FieldInfoRow | null;
  /** 說明面板開著（選單與待確認面板讓位）。 */
  isOpen: boolean;
  /** 這一次是指標點進來的。 */
  pointed: boolean;
  setPointed: (pointed: boolean) => void;
  /** 說明列被走到了（↓／↑ 或滑鼠）。 */
  hot: boolean;
  setHot: (hot: boolean) => void;
  /** 選了說明列。 */
  open: () => void;
  /**
   * ↑↓ 在候選與說明列之間走：↓ 走過最後一列才到說明列，↑ 從第一列繞到它；只有它時停在它上面。
   * 有處理就回傳 true（呼叫端 `preventDefault` 後 return）。
   */
  step: (key: string, count: number, current: number, setActive: (index: number) => void) => boolean;
};

export function useMenuInfoRow({
  field,
  allowed,
  hasContent,
  collapseMenu,
  menuShown,
  captureMenu,
  leave,
}: Options): MenuInfoRow {
  const info = useFieldInfoRow();
  const [pointed, setPointed] = useState(false);
  const [hot, setHot] = useState(false);
  const isOpen = info?.isOpen ?? false;
  /** 這一次是從說明列打開的 —— 觸控直接點沒有 hover 那一下，`hot` 不會先亮。 */
  const openedFromRow = useRef(false);

  const row = info && !isOpen && allowed && (hasContent || pointed) ? info : null;

  /** 說明取代選單（選了說明列與按 ⌥/ 兩條路都走這裡）。 */
  const giveWay = () => {
    setHot(false);
    setPointed(false);
    collapseMenu();
  };

  const open = () => {
    giveWay();
    openedFromRow.current = true;
    info?.open();
  };

  // 返回列（票 101 第二輪）：打開說明那一刻畫面上有選單或待確認面板，就回到那裡、高亮停在原處。
  // 每次 render 後重交一次，`FieldInfo` 打開時問到的才是當下的畫面。
  useLayoutEffect(() => {
    info?.provideBack(() => {
      const fromRow = openedFromRow.current;
      openedFromRow.current = false;
      if (!menuShown()) return null;
      const was = { pointed, hot: hot || fromRow };
      const restoreMenu = captureMenu();
      return () => {
        restoreMenu();
        setPointed(was.pointed);
        setHot(was.hot);
      };
    });
  });

  // 說明開關的那兩下（code review 2026-11-04）。
  // - **開**：⌥/ 那條路不經過 `open`，所以讓位也收在這裡。
  // - **關**：返回或 Esc 的話焦點已經回到欄位；點別處的話焦點不會回來，輸入框也就不會再 blur
  //   一次 —— 去讀說明時省掉的那次離開收尾，在這裡補上，字才不會卡在框裡。
  const wasOpen = useRef(false);
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = isOpen;
    if (isOpen && !was) giveWay();
    else if (!isOpen && was && !field.current?.contains(document.activeElement)) leave();
  });

  const step: MenuInfoRow["step"] = (key, count, current, setActive) => {
    if (count === 0 && !row) return false;
    if (key !== "ArrowDown" && key !== "ArrowUp") return false;
    const last = count - 1;
    const at = Math.min(current, last);
    if (hot) {
      if (count > 0) {
        setHot(false);
        setActive(key === "ArrowDown" ? 0 : last);
      }
    } else if (row && (key === "ArrowDown" ? at === last : at <= 0)) setHot(true);
    else setActive(key === "ArrowDown" ? (at + 1) % count : (at - 1 + count) % count);
    return true;
  };

  return { row, isOpen, pointed, setPointed, hot, setHot, open, step };
}

/**
 * 說明列那一個 `<li>` —— 三種欄位共用。弱化一階、一條分隔線與候選隔開（CSS 在 editor.css 的
 * 「說明列」那段）。按下去不搶焦點（`preventDefault`），焦點留在欄位，Esc 回來才接得住。
 */
export function InfoRowItem({
  label,
  hot,
  className,
  onHover,
  onPick,
}: {
  label: string;
  hot: boolean;
  className: string;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={hot}
      className={`${className}${hot ? " is-active" : ""}`}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      {label}
    </li>
  );
}
