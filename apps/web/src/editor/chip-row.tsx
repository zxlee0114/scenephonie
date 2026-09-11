/**
 * 一排 chip 與夾在它們之間的**輸入框** —— 地點／登場人物／對白人物與群演共用的版面。
 *
 * 兩個欄位元件（`entity-field.tsx`、`extras-field.tsx`）刻意不是同一個元件（群演不是實體，
 * 見 `extras-field.tsx` 檔頭），但**一排 chip 怎麼排**是同一件事：編劇在這一排四個欄位裡
 * 按的是同一批鍵、點的是同一些縫。
 *
 * ```
 * [👤 小明] ╷ [👤 小華] ╷ |輸入框
 *           └ 那道縫同時是**間距**與**插入點**：點它，游標就插進那一格
 * ```
 *
 * 輸入框不是永遠在隊尾 —— 它排在**第 `inputAt` 格**（拿一筆起來改時就是那一筆原本的位置）。
 * 所以這裡走的是**插入位置**（`0`…`chips.length`）而不是 chip 的索引。
 *
 * 空的輸入框插在中間時只是一個游標，**不佔版面**：寬度那一半是 CSS 的事
 * （`.entity-field__input--caret` 的負邊距），而**縫的數量**是這裡的事 —— 游標擠進來會讓
 * 原本一道縫變成兩道，所以它後面那一道收成零，游標就住在原本那一道裡。
 */
"use client";

import type { ReactNode } from "react";

/**
 * 一串字大概佔幾格 —— `<input size>` 的退路值（`field-sizing: content` 沒生效時才看得到）。
 *
 * `size` 以**平均字寬**計，中日文字元會因此排得太窄，所以拉丁字母與標點之外一律算兩格。
 * 下限是 `1`（`size=0` 不合法）：給到 `2` 的話，單字元的名字（`a`）會被撐得比它唯讀時還寬。
 */
export const columns = (text: string) =>
  Math.max(
    1,
    [...text].reduce(
      (n, c) => n + ((c.codePointAt(0) ?? 0) > 0x2ff ? 2 : 1),
      0,
    ),
  );

type Options = {
  /** 已經定案的那幾筆，**自己帶 key**。 */
  chips: readonly ReactNode[];
  /** 輸入框（連同它那層外殼），**自己帶 key**。 */
  input: ReactNode;
  /** 輸入框排在第幾格（`0` ＝ 所有 chip 之前，`chips.length` ＝ 全部之後）。 */
  inputAt: number;
  /** 空的輸入框插在 chip 中間 —— 那時它只是一個游標，得住在**一道**縫裡（見下）。 */
  bare: boolean;
  /** 手上正握著一筆 —— 整排的縫都不接受點擊（一次只編輯一筆）。 */
  locked: boolean;
  /** 把游標挪到第 `at` 格。 */
  moveCaret: (at: number) => void;
  /** 挪完之後把焦點交還給輸入框。 */
  focusInput: () => void;
};

export function chipRow({
  chips,
  input,
  inputAt,
  bare,
  locked,
  moveCaret,
  focusInput,
}: Options): ReactNode[] {
  /**
   * 兩顆 chip 之間那道縫。`at` 為 `null` ＝ 不接受點擊：游標已經在那（縫的一側就是輸入框），
   * 或者手上正握著一筆。
   */
  const gap = (key: string, at: number | null, tail = false, flush = false) => (
    <span
      key={key}
      className={[
        "entity-field__gap",
        tail && "entity-field__gap--tail",
        flush && "entity-field__gap--flush",
        at != null && "entity-field__gap--pick",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={
        at == null
          ? undefined
          : (e) => {
              e.preventDefault();
              moveCaret(at);
              focusInput();
            }
      }
    />
  );

  const units: { node: ReactNode; at: number; isInput: boolean }[] = [];
  for (let i = 0; i <= chips.length; i += 1) {
    if (i === inputAt) units.push({ node: input, at: i, isInput: true });
    const chip = chips[i];
    if (chip) units.push({ node: chip, at: i, isInput: false });
  }

  const row: ReactNode[] = [];
  units.forEach((unit, k) => {
    const prev = units[k - 1];
    // 縫的插入位置就是它**右邊**那個東西的位置；等於游標現在站的那一格就沒得點。
    if (prev)
      row.push(
        gap(
          `gap${k}`,
          unit.at === inputAt || locked ? null : unit.at,
          false,
          // 游標插進來時**多了一道縫** —— 原本 chip 之間只有一道，現在變成「縫 ＋ 游標 ＋ 縫」。
          // 游標本身不佔位（CSS 的負邊距），所以只要把它後面那一道收掉，整排就一動也不動。
          bare && prev.isInput,
        ),
      );
    row.push(unit.node);
  });
  // 輸入框不在隊尾時，尾端那一塊空白也要點得到 —— 否則欄位右半邊整片是死的（點下去既不
  // 聚焦也進不了游標）。那道縫吃掉剩下的空間（見 CSS 的 `--tail`）。
  if (inputAt < chips.length)
    row.push(gap("gap-end", locked ? null : chips.length, true));

  return row;
}
