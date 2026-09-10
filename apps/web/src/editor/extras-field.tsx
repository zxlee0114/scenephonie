/**
 * 群演欄 —— 內嵌簡表上的那一格（§4.7、票券 09）。
 *
 * 它長得像實體欄位（`entity-field.tsx`），但**刻意不是同一個元件**，因為群演不是實體：
 *
 * | | 人物／地點 | 群演 |
 * |---|---|---|
 * | 自動補全命中的是 | 一筆實體（`{ id, 顯示名 }`） | **幾個字** |
 * | 第三列「作為既有實體的另一個名字」 | 有 | **沒有** —— 沒有實體可以指 |
 * | 一格的內容 | 名字 | **描述 ＋ 人數** |
 *
 * 中間那一列是關鍵：把跨場次的描述做成連結，等於承諾「第 3 場的路人與第 7 場的路人是同一批
 * 人」，而群演正是因為沒有那種身分連續性才不是人物。所以這裡**只補字串** —— 選一列只是把
 * 那串字填進輸入框，什麼都還沒定案。
 *
 * 共用的是**規則**不是程式碼：多值分隔（`splitNamesLive`）、注音組字期間不動作、Backspace
 * 把最後一筆還原成可編輯文字 —— 三者與實體欄位逐字同一套，因為編劇在這一排四個欄位裡按的
 * 是同一批鍵。
 *
 * ⚠️ **重新編輯保住 `extraId`**：對白的人物欄可以指向本場的群演，改人數若換一個新 id，那句
 * 台詞的引用當場懸空。拿下來的東西放回去就該是原來那一筆（同 `entity-field.tsx` 的 `editing`）。
 */
"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { formatExtra, mintExtraId, parseExtra, splitNamesLive, type ExtraRef } from "@scenephonie/schema";

import { EXTRA_MARK } from "./field-marks";
import { HELP_KEY_HINT } from "./field-info";

type Props = {
  /** 這一場的群演，依欄位裡的順序。 */
  extras: readonly ExtraRef[];
  /**
   * 別場用過的描述（**只有字串**）。
   *
   * 是函式不是值：算它要走一遍整份 doc，而 chip row 每次重繪都會問（同 `EntityField.usage`）。
   */
  suggestions?: () => readonly string[];
  /** 有變動時回報**整份**清單（上層跑 `setSceneExtras` 寫回 doc）。 */
  onCommit: (extras: ExtraRef[]) => void;
  placeholder?: string;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
};

type Row = { key: string; label: string; run: () => void };

export function ExtrasField({
  extras,
  suggestions,
  onCommit,
  placeholder = "群演",
  describedBy,
  inputRef,
  onKeyDown,
}: Props) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  /** 組字中嗎 —— ref 是真相（同步），state 是畫面（重繪）。同 `entity-field.tsx`。 */
  const composing = useRef(false);
  const [composingNow, setComposingNow] = useState(false);
  /** 正在被重新編輯的那一筆：放回去時用回它自己的 `extraId`（見檔頭）。 */
  const editing = useRef<ExtraRef | null>(null);
  const selectNext = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const takeInput = (el: HTMLInputElement | null) => {
    input.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el;
  };

  useEffect(() => {
    if (!selectNext.current) return;
    selectNext.current = false;
    input.current?.select();
  });

  const reset = () => {
    editing.current = null;
    setText("");
    setActive(0);
    setDismissed(false);
  };

  /** 一段字 → 一筆群演。重新編輯中的那一筆沿用原 id，其餘鑄新的。 */
  const toExtra = (segment: string): ExtraRef | null => {
    const parsed = parseExtra(segment);
    if (!parsed) return null;
    const held = editing.current;
    editing.current = null;
    return { extraId: held?.extraId ?? mintExtraId(), ...parsed };
  };

  const add = (segments: string[]) => {
    const added = segments.map(toExtra).filter((e): e is ExtraRef => e !== null);
    if (added.length === 0) return;
    onCommit([...extras, ...added]);
  };

  /** 把一筆 chip 還原成可編輯的文字（點它，或空欄位上 Backspace）—— 連人數一起。 */
  const editExtra = (extra: ExtraRef, selectAll = false) => {
    editing.current = extra;
    onCommit(extras.filter((e) => e !== extra));
    setText(formatExtra(extra));
    setActive(0);
    setDismissed(false);
    selectNext.current = selectAll;
    input.current?.focus();
  };

  const commitText = () => {
    if (!text.trim()) return;
    // 解析不出一筆群演（例：只打了 `x8`）時**把手上那一筆放回去** —— 重新編輯是把 chip
    // 拿下來改，改到一半打成沒有描述的字不該讓它消失。沒有手上那一筆就什麼都不做。
    const parsed = parseExtra(text);
    if (!parsed) {
      const held = editing.current;
      if (held) onCommit([...extras, held]);
      reset();
      return;
    }
    add([text]);
    reset();
  };

  const query = text.trim();
  const parsed = parseExtra(text);
  const menuOpen = !composingNow && !dismissed && query.length > 0;

  /** 命中的別場描述 —— 拿**描述那一段**去比對，人數不參與（`咖啡廳客 x8` 也要命中）。 */
  const hits = (): string[] => {
    const needle = parsed?.description ?? query;
    // 這一場已經有的描述不列 —— 它就在旁邊當 chip，補它一次只是雜訊。
    const here = new Set(extras.map((e) => e.description));
    return (suggestions?.() ?? [])
      .filter((d) => d.includes(needle) && d !== parsed?.description && !here.has(d))
      .slice(0, 5);
  };

  const rows: Row[] = [];
  if (menuOpen && parsed) {
    rows.push({
      key: "commit",
      label: `＋ 新增群演「${parsed.description}」${parsed.count} 人`,
      run: commitText,
    });
    for (const description of hits()) {
      rows.push({
        key: `hit:${description}`,
        // **只補字串**：選它只是把描述填進輸入框，還沒有任何一筆被建立，人數也還沒決定。
        label: `${EXTRA_MARK} ${description}`,
        run: () => {
          setText(description);
          setActive(0);
          input.current?.focus();
        },
      });
    }
  }

  /** 組字中的唯讀預覽（同 `entity-field.tsx`）：看得見，但接不到鍵盤與滑鼠。 */
  const preview = composingNow && query.length > 0 ? hits() : [];

  const activeRow = rows[Math.min(active, rows.length - 1)];

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing.current) return; // 組字中每一顆鍵都還給 IME

    if (rows.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % rows.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + rows.length) % rows.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        activeRow?.run();
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
      return;
    }

    if (event.key === "Enter" && query) {
      event.preventDefault();
      event.stopPropagation();
      commitText();
      return;
    }

    if (event.key === "Backspace" && text === "" && extras.length > 0) {
      event.preventDefault();
      // 拿下來的那一筆整串反白：再按一次就一起刪掉（同實體欄位的裁決）。
      editExtra(extras[extras.length - 1]!, true);
      return;
    }

    onKeyDown?.(event);
  };

  const onChange = (value: string) => {
    setText(value);
    setDismissed(false);
    setActive(0);
    if (composing.current) return; // 組字中不切 chip
    const { names, rest } = splitNamesLive(value);
    if (names.length === 0) return;
    setText(rest);
    add(names);
  };

  return (
    <div className="entity-field extras-field">
      <span className="entity-field__chips">
        {extras.map((extra) => (
          <span
            key={extra.extraId}
            className="entity-chip entity-chip--extra"
            // 點它 ＝ 改它（描述與人數一起回到輸入框）。`mousedown` 而非 `click`：見 entity-field.tsx。
            onMouseDown={(e) => {
              e.preventDefault();
              editExtra(extra);
            }}
          >
            <span className="entity-chip__mark" aria-hidden="true">
              {EXTRA_MARK}
            </span>
            {formatExtra(extra)}
            <button
              type="button"
              className="entity-chip__remove"
              tabIndex={-1}
              aria-label={`移除${extra.description}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCommit(extras.filter((x) => x !== extra));
                input.current?.focus();
              }}
            >
              ×
            </button>
          </span>
        ))}
      </span>

      <input
        ref={takeInput}
        placeholder={extras.length > 0 ? "" : placeholder}
        aria-label={placeholder}
        aria-describedby={describedBy}
        aria-keyshortcuts={describedBy ? HELP_KEY_HINT : undefined}
        aria-expanded={rows.length > 0}
        aria-haspopup="listbox"
        role="combobox"
        value={text}
        onCompositionStart={() => {
          composing.current = true;
          setComposingNow(true);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setComposingNow(false);
          onChange(event.currentTarget.value);
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 打完就走是常態，不該把字吃掉（同實體欄位的 blur 回寫）。
          if (!composing.current) commitText();
        }}
      />

      {preview.length > 0 && (
        <ul className="entity-field__menu entity-field__menu--preview" aria-hidden="true">
          {preview.map((description) => (
            <li key={description}>
              {EXTRA_MARK} {description}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <ul className="entity-field__menu" role="listbox" aria-label={`${placeholder}建議`}>
          {rows.map((row, i) => (
            <li
              key={row.key}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                row.run();
              }}
            >
              {row.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
