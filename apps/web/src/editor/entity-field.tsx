/**
 * 實體欄位 —— 地點欄、登場人物欄與對白人物欄共用的一個元件（§4.7、§7.6）。
 *
 * 三件事在這裡並存：
 *
 * **① 多值輸入規則**（`@scenephonie/schema` 的 `splitNamesLive`）：標點是分隔符、空白是名字的
 * 一部分，即時切成 chip，Backspace 還原成可編輯文字，貼上走同一份解析。規則本身住在 kernel，
 * 這裡只負責把它接到鍵盤上 —— 「頓號怎麼切」在伺服器端與這裡必須是同一個答案。
 *
 * **② 自動補全三列**：命中既有（`📍`／`👤`）／建立新實體（`＋`）／作為既有實體的另一個名字
 * （`🔗`）。**打字當下不問任何問題** —— 系統不可能懷疑「海豚公寓房間」就是「未知大樓房間」，
 * 積極合併相似名會把兩套陳設併成一套。第三列是留給編劇**主動說出口**的地方，他寫的當下就知道。
 *
 * **③ 注音組字期間選單完全不動作**（§7.6）：組字中不切 chip、不開選單、不回寫外部狀態。
 * 這是票券 03 那個 bug 家族的同一條防線 —— 注音的空白鍵是選字鍵、Enter 是送出鍵，把任何
 * 語意綁在那兩顆鍵上都會在組字期間被 IME 吃掉。
 *
 * ⚠️ **建立實體與寫入 doc 的順序在這裡定案**：`onCreate` 先跑完（實體落地、目錄多一筆），
 * 才呼叫 `onCommit` 讓上層跑 domain command。反過來的話 command 會被自己的不變式擋下（§6.6）。
 */
"use client";

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { splitNamesLive } from "@scenephonie/schema";

export type EntityOption = { id: string; name: string };
/**
 * 一個引用：實體 id ＋ **這一場顯示的名字**（別名不存在實體上，就是這個欄位）。
 *
 * `id` 為 `null` ＝ **從來沒有 id 的過渡引用**（票券 04／07 的佔位形狀）。讀取容忍它、
 * chip 照樣顯示顯示名，但它寫不回去 —— 沒有實體可指（§6.6）。用 `null` 而不是空字串，
 * 是因為「沒有實體」是一個狀態，不是一個名字剛好是空的 id。
 */
export type EntityRef = { id: string | null; displayName: string };

export type EntityKind = "location" | "character";

/** 命中既有實體的記號。地點與人物各自一個，讓兩種欄位一眼可辨。 */
const HIT_MARK: Record<EntityKind, string> = { location: "📍", character: "👤" };
const NEW_MARK = "＋";

type Props = {
  kind: EntityKind;
  /** 未填時的提示字，也是無障礙標籤。 */
  placeholder: string;
  refs: readonly EntityRef[];
  /** 這個專案的名字目錄（append-only）。 */
  options: readonly EntityOption[];
  /**
   * 每筆實體被幾場引用 —— 選單第一列的「（12 場）」。沒給就不印。
   *
   * **是函式不是值**：算它要走一遍整份 doc，而對白的 node view 每打一個字就重繪一次（§7.7）。
   * 只有選單真的要畫的時候才問。
   */
  usage?: () => ReadonlyMap<string, number>;
  /** 多值欄（地點／登場人物）；對白人物欄是單值。 */
  multiple?: boolean;
  /** 引用有變動時回報**整份**引用清單（上層跑 domain command 寫回 doc）。 */
  onCommit: (refs: EntityRef[]) => void;
  /** 建立一筆新實體。**必須在 `onCommit` 之前完成** —— 先建立實體、再寫入 doc。 */
  onCreate: (name: string) => Promise<EntityOption | null>;
  /** 把實體本身改名（第三列第二步的「同時把實體改名」）。沒給就不出現那個選項。 */
  onRenameEntity?: (id: string, name: string) => void;
  className?: string;
  inputClassName?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

/** 選單的三個階段。第二、三階段是第三列（別名）展開後的兩步。 */
type Stage =
  | { name: "suggest" }
  | { name: "aliasPick" }
  | { name: "aliasMode"; target: EntityOption };

type Row = {
  key: string;
  label: ReactNode;
  run: () => void;
};

export function EntityField({
  kind,
  placeholder,
  refs,
  options,
  usage,
  multiple = false,
  onCommit,
  onCreate,
  onRenameEntity,
  className,
  inputClassName,
  onKeyDown,
  inputRef,
}: Props) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "suggest" });
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  /** 這一輪由本欄位建出來的實體 —— 新建 chip 與命中 chip 視覺可辨（`＋` vs `📍`）。 */
  const [bornHere, setBornHere] = useState<readonly string[]>([]);
  /**
   * 組字中嗎 —— **ref 是真相（同步），state 是畫面（重繪）**。
   *
   * 只有 ref 的話會漏掉一次重繪：注音按 Enter 送出時 `text` 通常與組字期間的最後一次
   * `onChange` 相同，React 於是 bail out，選單要等到下一次真的改到 `text`（使用者多打的
   * 那個空白）才畫出來。**「確認輸入」的那一刻就是 `compositionend`**，它必須自己觸發一次
   * 重繪，否則選單的時機會晚一個按鍵。
   */
  const composing = useRef(false);
  const [composingNow, setComposingNow] = useState(false);
  /** 呼叫端也可能要這個 input（焦點串接），所以自己留一份再轉交出去。 */
  const input = useRef<HTMLInputElement>(null);
  const takeInput = (el: HTMLInputElement | null) => {
    input.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el;
  };
  const field = useRef<HTMLDivElement>(null);

  /**
   * 目前**存在**的實體 —— 目錄減掉孤兒（存在＝被引用，ADR-0005）。
   *
   * 沒有 `usage` 可問時（獨立使用的欄位、測試）就是整份目錄：那時沒有 doc，也就沒有
   * 「被誰引用」這個問題。
   */
  const existing = (): readonly EntityOption[] => {
    const counts = usage?.();
    return counts ? options.filter((o) => counts.has(o.id)) : options;
  };

  /** 同名的**存在**實體。孤兒不算命中 —— 它不存在，所以那個名字仍然是「建立新實體」。 */
  const byName = (name: string) => existing().find((o) => o.name === name) ?? null;

  /** 把幾筆引用併進現有的（單值欄就是取代成最後一筆）。 */
  const merge = (added: EntityRef[]) => {
    if (added.length === 0) return;
    if (!multiple) {
      onCommit([added[added.length - 1]!]);
      return;
    }
    const kept = refs.filter((r) => !added.some((a) => a.id === r.id));
    onCommit([...kept, ...added]);
  };

  /**
   * 把一個名字變成引用：**命中同名實體就用它，否則建立一筆新的**。
   *
   * 這就是「打字當下不問任何問題」—— 不問「這是不是你上次那個？」，也不積極合併相似名。
   * 要說兩個名字指同一筆實體，走第三列。
   *
   * ⚠️ 這支只解析、**不寫回**：一次貼上多個名字時要等全部解析完才寫一次，否則第二筆會
   * 覆蓋掉第一筆（`refs` 是 prop，中途還沒重繪過）。
   */
  const resolve = async (name: string): Promise<EntityRef | null> => {
    const hit = byName(name);
    if (hit) return { id: hit.id, displayName: name };

    const created = await onCreate(name);
    if (!created) return null; // 建立失敗就什麼都不寫 —— 沒有實體就不該有引用（不變式 ⑧）
    setBornHere((ids) => [...ids, created.id]);
    return { id: created.id, displayName: name };
  };

  /** 一次解析多個名字（貼上、連打頓號），解析完寫一次。 */
  const resolveAll = async (names: string[]) => {
    const resolved: EntityRef[] = [];
    for (const name of names) {
      const ref = await resolve(name);
      if (ref) resolved.push(ref);
    }
    merge(resolved);
  };

  /**
   * 把一個 chip 還原成**可編輯的文字**（點它，或在空欄位上按 Backspace）。
   *
   * 不是「刪掉再重打」：字回到輸入框、游標接在後面，於是改一個字就會重新走一次
   * 命中／新建／別名那三列 —— 改名這件事本來就該經過那個選單，而不是在 chip 上原地改掉
   * （原地改分不出「這一場叫別的名字」與「這個實體改名了」，而那正是 §4.7 要編劇說清楚的事）。
   */
  const editRef = (ref: EntityRef) => {
    onCommit(refs.filter((r) => r !== ref));
    setText(ref.displayName);
    setDismissed(false);
    setActive(0);
    input.current?.focus();
  };

  const closeMenu = () => {
    setStage({ name: "suggest" });
    setDismissed(true);
  };

  const reset = () => {
    setText("");
    setStage({ name: "suggest" });
    setActive(0);
    setDismissed(false);
  };

  const query = text.trim();
  // 組字期間選單完全不動作（§7.6）；Esc 之後也不再自己彈回來，直到下一次打字。
  const menuOpen = !composingNow && !dismissed && query.length > 0;

  const rows: Row[] = [];
  if (menuOpen) {
    // **孤兒不出現在自動補全**（ADR-0005）—— 「存在＝被引用」不是一句口號，選單是它唯一
    // 看得見的地方。目錄是 append-only 的，裡面一定會累積 ⌘Z 留下的孤兒；「v1 永不清理」
    // 指的是**不刪資料列**，不是「照樣顯示」。
    const counts = usage?.();
    const known = existing();
    const hits = known.filter((o) => o.name.includes(query) && o.name !== query).slice(0, 5);
    const exact = known.find((o) => o.name === query) ?? null;

    if (stage.name === "suggest") {
      for (const option of [...(exact ? [exact] : []), ...hits]) {
        const count = counts?.get(option.id);
        rows.push({
          key: `hit:${option.id}`,
          label: `${HIT_MARK[kind]} ${option.name}${count ? `（${count} 場）` : ""}`,
          run: () => {
            merge([{ id: option.id, displayName: option.name }]);
            reset();
          },
        });
      }
      if (!exact) {
        rows.push({
          key: "create",
          label: `${NEW_MARK} 建立新實體「${query}」`,
          run: () => {
            void commitText();
          },
        });
      }
      // 第三列永遠在 —— 它不是建議，是一個入口。（一個存在的實體都沒有時就沒得指了。）
      if (known.length > 0) {
        rows.push({
          key: "alias",
          label: "🔗 作為既有實體的另一個名字…",
          run: () => {
            setStage({ name: "aliasPick" });
            setActive(0);
          },
        });
      }
    } else if (stage.name === "aliasPick") {
      for (const option of known) {
        rows.push({
          key: `alias:${option.id}`,
          label: `${HIT_MARK[kind]} ${option.name}`,
          run: () => {
            setStage({ name: "aliasMode", target: option });
            setActive(0);
          },
        });
      }
    } else {
      const target = stage.target;
      rows.push({
        key: "alias-scene-only",
        label: `只當這一場的名字（${target.name}）`,
        run: () => {
          merge([{ id: target.id, displayName: query }]);
          reset();
        },
      });
      if (onRenameEntity) {
        rows.push({
          key: "alias-rename",
          label: `同時把實體改名為「${query}」`,
          run: () => {
            // 改實體的名字**不代換全文**：別場的顯示名與正文一個字都不動。
            onRenameEntity(target.id, query);
            merge([{ id: target.id, displayName: query }]);
            reset();
          },
        });
      }
    }
  }

  const activeRow = rows[Math.min(active, rows.length - 1)];

  /** 把還沒 chip 化的字定案（Enter、離開欄位、選單的「建立新實體」都走這裡）。 */
  const commitText = async () => {
    if (!query) return;
    const ref = await resolve(query);
    if (ref) merge([ref]);
    reset();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // 組字中把每一顆鍵都還給 IME —— 選字用的方向鍵與 Enter 都不是我們的。
    if (event.nativeEvent.isComposing || composing.current) return;

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
      // Esc ＝「現在別煩我」：關掉選單，打到一半的字留著。
      event.preventDefault();
      event.stopPropagation();
      if (stage.name === "suggest") closeMenu();
      else setStage({ name: "suggest" });
      return;
    }

    // Enter 只有在「還有字沒定案」時屬於這個欄位。空欄位上的 Enter 是呼叫端的（對白的人物欄
    // 按 Enter 是進台詞、空對白則是變回動作）—— 攔下來會變成「按了沒反應」。
    if (event.key === "Enter" && query) {
      event.preventDefault();
      event.stopPropagation();
      void commitText();
      return;
    }

    // Backspace 在空欄位上 ＝ 把最後一個 chip 還原成可編輯文字（不是直接刪掉）。
    if (event.key === "Backspace" && text === "" && refs.length > 0) {
      event.preventDefault();
      editRef(refs[refs.length - 1]!);
      return;
    }

    onKeyDown?.(event);
  };

  const onChange = (value: string) => {
    setText(value);
    setDismissed(false);
    setActive(0);
    if (composing.current) return; // 組字中不切 chip
    // 多值輸入規則的適用範圍就是 §4.7 標題那一行：**地點欄與登場人物欄**。對白人物欄是單值，
    // 標點在那裡就是名字裡的普通字元 —— 在那裡切開會建出第二筆實體卻只留下最後一筆，
    // 憑空多一個孤兒。
    if (!multiple) return;

    const { names, rest } = splitNamesLive(value);
    if (names.length === 0) return;
    setText(rest);
    void resolveAll(names);
  };

  return (
    <div className={`entity-field${className ? ` ${className}` : ""}`} ref={field}>
      <span className="entity-field__chips">
        {refs.map((ref) => {
          const entity = options.find((o) => o.id === ref.id) ?? null;
          const born = ref.id != null && bornHere.includes(ref.id);
          return (
            <span
              key={`${ref.id}:${ref.displayName}`}
              className={[
                "entity-chip",
                born ? "entity-chip--new" : entity ? "entity-chip--hit" : "entity-chip--dangling",
              ].join(" ")}
              // 懸空引用（實體被 ⌘Z 掉）不跳警告、不少印 —— 只是少一條可聚合的連結。
              title={entity && entity.name !== ref.displayName ? entity.name : undefined}
              // 點 chip ＝ 改它。`mousedown` 而非 `click`：`click` 要等 `mouseup`，中間
              // 輸入框已經先 blur 過一輪，打到一半的字會被 blur 的定案吃掉。
              onMouseDown={(e) => {
                e.preventDefault();
                editRef(ref);
              }}
            >
              {entity || born ? (
                <span className="entity-chip__mark" aria-hidden="true">
                  {born ? NEW_MARK : HIT_MARK[kind]}
                </span>
              ) : null}
              {ref.displayName}
              <button
                type="button"
                className="entity-chip__remove"
                tabIndex={-1}
                aria-label={`移除${ref.displayName}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // × 是刪除，不是編輯 —— 別讓它冒泡成點了 chip
                  onCommit(refs.filter((r) => r !== ref));
                  input.current?.focus();
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </span>

      <input
        ref={takeInput}
        className={inputClassName}
        // 已經有 chip 就不必再留提示字 —— chip 自己就說明了這一欄是什麼。
        placeholder={refs.length > 0 ? "" : placeholder}
        aria-label={placeholder}
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
          // 組字結束才輪到我們：這一刻起選單與分隔符才開始作用。
          onChange(event.currentTarget.value);
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 離開欄位時把還沒 chip 化的字定案（與 CjkField 的 blur 回寫同一個理由：
          // 打完就走是常態，不該把字吃掉）。
          if (!composing.current) void commitText();
          setStage({ name: "suggest" });
        }}
      />

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
