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
 *
 * ── 手上握著一批時，選單說的是「改」不是「新增」（票券 40）─────────────────
 * 承上：那一下就是**就地改**，所以第一列印 `✏️ 把「路人（3）」改成「路人（8）」`。想留著原本
 * 那批、另外造一筆的，走 `addAnother` 那一列 —— 那是人物欄 `＋ 建立新實體` 在這一側的對應
 * 物。兩列都不寫場數：群演只影響這一場，這正是它與票券 39 那三列（實體有別場，按下去可能
 * 動到別場）的差別。選單頂端那一行唯讀抬頭（`heldNote`）與實體欄逐字同一套，只是這裡多說
 * 一件事：框裡只有名稱，**人數保留**（票券 47）。
 *
 * ── 拿起來改的時候，框裡只有名稱（票券 47）───────────────────────────
 * 人數不在那串字裡，所以改名字**根本弄不掉人數** —— 最常見的那件事因此是零成本的。
 * 連帶地這個框**不認** `路人 x8` 的尾綴：那幾個字就是名字的一部分。一旦它也認尾綴，此刻
 * 就有三個東西要調和（人數的現值、框裡打的尾綴、選單裡挑的值），而三者衝突時誰贏沒有一個
 * 編劇猜得到的答案。
 *
 * ⚠️ **新增那一側照舊認尾綴**（`readText` 的另一半）：那個框從零開始，整串都還沒定案。
 * 同一個輸入框在兩種狀態下讀法不同是可以的，因為狀態本身看得見（chip 外殼在不在）。
 */
"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  formatExtra,
  mintExtraId,
  parseExtra,
  splitNamesLive,
  type ExtraRef,
} from "@scenephonie/schema";

import { useChipCaret } from "./chip-caret";
import { chipRow, columns } from "./chip-row";
import { EXTRA_MARK, NEW_MARK, PUT_BACK_MARK, RENAME_MARK } from "./field-marks";
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
  /** 這一格自己用不到的鍵（chip row 的格線導航）。焦點在 chip 上時 target 是那個 chip。 */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
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
  /**
   * **輸入框排在第幾格** —— `0` ＝ 所有 chip 之前，`null` ＝ 全部之後（平常的樣子）。
   *
   * 與實體欄位逐字同一套（見 `entity-field.tsx` 的 `caret`）：拿一筆起來改時輸入框停在它
   * 原本的位置、定案之後停在那一顆之後、點兩顆之間那道縫也是改它。
   */
  const caret = useRef<number | null>(null);
  /** 只為了重繪 —— 「手上那一筆」與游標位置都住在 ref 裡，改它們不會驚動 React。 */
  const [, redraw] = useReducer((n: number) => n + 1, 0);
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
    // `caret` 不清 —— `add` 剛把它挪到新 chip 之後，那就是游標該在的地方。
    setText("");
    setActive(0);
    setDismissed(false);
  };

  /**
   * 框裡那串字 → 一筆群演的**內容**（沒有 id）。兩種讀法，由「手上握著沒有」分野。
   *
   * 握著一批時框裡只有**名稱**，人數沿用那一批的現值（票券 47）—— 所以改名字弄不掉人數，
   * 而 `路人 x8` 的尾綴只是名字的幾個字。沒握著時整串都還沒定案，尾綴照舊認（`parseExtra`）。
   */
  const readText = (segment: string): Omit<ExtraRef, "extraId"> | null => {
    const held = editing.current;
    if (!held) return parseExtra(segment);
    const description = segment.trim();
    return description ? { description, count: held.count, countValue: held.countValue } : null;
  };

  /** 一段字 → 一筆群演。重新編輯中的那一筆沿用原 id 與人數，其餘鑄新的。 */
  const toExtra = (segment: string): ExtraRef | null => {
    const content = readText(segment);
    if (!content) return null;
    const held = editing.current;
    editing.current = null;
    return { extraId: held?.extraId ?? mintExtraId(), ...content };
  };

  const add = (segments: string[]) => {
    const added = segments.map(toExtra).filter((e): e is ExtraRef => e !== null);
    if (added.length === 0) return;
    // 放在**游標停的地方**，定案之後游標停在這一串之後（同實體欄位的 `merge`）。
    const at = caret.current;
    if (at != null && at <= extras.length) {
      caret.current = at + added.length;
      onCommit([...extras.slice(0, at), ...added, ...extras.slice(at)]);
    } else {
      caret.current = null;
      onCommit([...extras, ...added]);
    }
    redraw(); // `toExtra` 把手上那一筆放下了 —— 那是 ref，要自己說一聲
  };

  /**
   * 把一筆 chip 還原成可編輯的文字（點它、空欄位上 Backspace、焦點在它身上按 Enter）——
   * 框裡**只有名稱**，人數不在那串字裡（票券 47，見檔頭）。
   *
   * **一律整串反白**：可以直接覆寫，也還是能按 → 收起來接著改。滑鼠進來與 Backspace 進來
   * 原本是兩種樣子，統一成這一種（使用者裁決 2026-09-11，同實體欄位的 `editRef`）。
   *
   * **手上已經握著一筆時擋住** —— 同一個手勢不該有兩種看不見的結果（同上）。
   */
  const editExtra = (extra: ExtraRef) => {
    if (editing.current) return; // 一次只編輯一筆（同實體欄位的 `editRef`）
    caret.current = extras.indexOf(extra);
    editing.current = extra;
    onCommit(extras.filter((e) => e !== extra));
    setText(extra.description);
    setActive(0);
    setDismissed(false);
    selectNext.current = true;
    input.current?.focus();
  };

  /** 把手上那一筆**放掉** —— 這一場就沒有這一批群演了（拿起來時已經從 doc 上撤掉）。 */
  const letGo = () => {
    editing.current = null;
    // `caret` 刻意不動 —— 游標留在它原本站的那一格，不跳回隊尾。
    redraw();
  };

  const commitText = () => {
    if (!text.trim()) return;
    // 讀不出一筆群演（例：只打了 `x8`）就什麼都不做。這**只發生在沒握著的那一側** ——
    // 握著時框裡的每一串非空白字都是合法名稱（票券 47），所以手上那一批掉不了。
    if (!readText(text)) {
      reset();
      return;
    }
    add([text]);
    reset();
  };

  /**
   * **另外開一批**（票券 40）—— 手上那一筆放回原位，框裡的字另外鑄一個 id。
   *
   * 沒有這一條路，拿起 `路人` 改到一半發現其實是另一批人（`保全`）的編劇只能先放手、
   * 再打一次：`toExtra` 一律沿用握著那一筆的 id（見檔頭），改就是就地改。這一列是人物欄
   * `＋ 建立新實體` 在群演這一側的對應物 —— 留著原本那筆，另外造一筆。
   *
   * 新的那一批**沿用手上這一批的人數**：框裡只有名稱（票券 47），這一刻畫面上唯一的人數
   * 就是它。要改人數走人數那條路，不是靠這裡猜。
   */
  const addAnother = () => {
    const held = editing.current;
    const content = readText(text);
    if (!held || !content) return;
    const at = Math.min(caret.current ?? extras.length, extras.length);
    const minted: ExtraRef = { extraId: mintExtraId(), ...content };
    // 放回去的那一筆站回它原本那一格，新的一批緊接在後 —— 游標停在兩顆之後（同 `add`）。
    caret.current = at + 2;
    onCommit([...extras.slice(0, at), held, minted, ...extras.slice(at)]);
    reset();
  };

  const query = text.trim();
  const parsed = readText(text);
  const menuOpen = !composingNow && !dismissed && query.length > 0;

  /**
   * 命中的別場描述 —— 拿**描述那一段**去比對，人數不參與（`咖啡廳客 x8` 也要命中）。
   *
   * 「剝掉尾綴再比對」只發生在**新增**那一側：握著一批時框裡本來就只有名稱（票券 47），
   * 那一整串就是要比對的東西。
   */
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
    /**
     * 第一列說的是**按下去會發生的事**（票券 40）。
     *
     * 手上握著一批時那一下不是「新增」—— `toExtra` 沿用握著那一筆的 `extraId`（見檔頭），
     * 所以它是**就地改**。這一列不寫場數：群演本來就只影響這一場，那正是它與票券 39 那列
     * （實體有別場，所以要先說會不會動到別場）的差別。
     *
     * 兩邊都印整串 `描述（人數）`（票券 40 那三列一個字都不用改）—— 名稱改了、人數沒動時
     * 它自己就說對了：`路人（8）` → `保全（8）`。
     */
    const held = editing.current;
    const before = held ? formatExtra(held) : null;
    const after = formatExtra(parsed);
    const changed = before != null && before !== after;
    // 這一列永遠是 `commitText`（Enter 也走它）—— 變的只有它怎麼自我介紹。
    rows.push({
      key: "commit",
      label:
        before == null
          ? `${NEW_MARK} 新增群演「${parsed.description}」${parsed.count} 人`
          : changed
            ? `${RENAME_MARK} 把「${before}」改成「${after}」`
            : // 字一個都沒改 —— 這一下什麼都沒動。名字不必再說一次（抬頭已經印著它），
              // 這一列要說的只有「按下去等於沒事發生」（編劇指定，票券 40 第二輪）。
              `${PUT_BACK_MARK} 不修改，返回`,
      run: commitText,
    });
    // 另外開一批：只在**手上握著一批而且字改了**的時候有話說。沒握著東西時「新增」本來就
    // 是另外一批；字沒改時它只會造出一批一模一樣的，那不是編劇在這一刻要的。
    if (changed) {
      rows.push({
        key: "another",
        // 代價寫在按下去之前（ADR-0006）—— 這一列與上一列的差別就是「原本那批還在不在」，
        // 所以兩批都點名（編劇指定的措辭，票券 40 第二輪）。
        label: `${NEW_MARK} 新增「${after}」群演，保留「${before}」`,
        run: addAnother,
      });
    }
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

  /**
   * 手上握著一批時，選單頂端那一行**唯讀**的抬頭（票券 40 第二輪，與實體欄逐字同一套）。
   *
   * 它補的是一個沒有回饋的時刻：**字還沒改**。那時第一列只說得出「不修改，返回」，而「改這裡
   * 的字就能改這一批」這條路完全不可見。字改過之後它仍然在，因為那時框裡的字已經不是那一批的
   * 樣子了，**「我在編輯哪一批」得有人說**。
   *
   * 與實體欄的差別只有一句話：框裡只有名稱，所以這一行要說出**人數保留**（票券 47）——
   * 不然編劇會以為改名字得把 `x8` 一起重打。它**不是一列選項**：不進 `rows`、選不到、
   * Enter 碰不到（標籤放結果、說明另外放，
   * 票券 36 立的分工）。框裡清空了它也還在 —— 那一刻那一批還握在手上，措辭換成下一顆
   * Backspace 會做什麼：放手（見 `letGo`）。
   */
  const heldNow = editing.current;
  const heldNote =
    !heldNow || dismissed || composingNow
      ? null
      : query === ""
        ? `${RENAME_MARK} 正在編輯「${formatExtra(heldNow)}」，再按一次 Backspace 移除這一批`
        : `${RENAME_MARK} 正在編輯「${formatExtra(heldNow)}」，改的是名稱 —— 數量保留，不必手動重寫`;

  const activeRow = rows[Math.min(active, rows.length - 1)];

  /** chip 之間的方向鍵（票券 34 第三輪）—— 規則與版面說明見 `./chip-caret`。 */
  const chipCaret = useChipCaret({
    count: extras.length,
    home: Math.min(caret.current ?? extras.length, extras.length),
    input,
    text,
    exit: (event) => onKeyDown?.(event),
    edit: (i) => {
      const extra = extras[i];
      if (extra) editExtra(extra);
    },
    // 方向鍵也停得進 chip 之間那道縫。手上握著一筆時不動 —— 那一刻輸入框「排在第幾格」
    // 說的是那一筆的位置，挪走它畫面就對不上了。
    moveCaret: (at) => {
      if (editing.current) return;
      caret.current = at;
      redraw();
    },
  });

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

    if (event.key === "Backspace" && text === "") {
      // 手上還握著一筆（清空了但還沒放手）—— 這一下是**放掉它**，不是去拿前一個。
      if (editing.current) {
        event.preventDefault();
        letGo();
        return;
      }
      // 把**游標左邊**那一顆拿下來改，整串反白：再按一次就一起刪掉（同實體欄位的裁決）。
      const left = extras[(caret.current ?? extras.length) - 1];
      if (left) {
        event.preventDefault();
        editExtra(left);
        return;
      }
    }

    // ← 從字首退進 chip（空欄位才算）—— 沒退成才輪到 chip row 的格線導航。
    if (chipCaret.inputKeyDown(event)) return;

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

  // 手上那一批 —— 算抬頭時已經取過（同一次 render 裡 ref 不會自己變），這裡沿用同一個值。
  const held = heldNow;
  /** 輸入框現在**夾在 chip 中間**嗎 —— 決定它吃不吃那條彈性寬度（見 CSS 的 `--inline`）。 */
  const inputAt = Math.min(caret.current ?? extras.length, extras.length);
  const inline = held != null || inputAt < extras.length;
  /** 空的輸入框插在 chip 中間 —— 它這一刻只是一個游標。 */
  const caretOnly = !held && inputAt < extras.length && text === "";

  /** 一筆已經定案的群演。手上握著一筆時整排 chip 都是動不得的（見 `editExtra`）。 */
  const chipNode = (extra: ExtraRef, i: number) => (
    <span
      key={extra.extraId}
      {...chipCaret.chipProps(i)}
      className={["entity-chip", "entity-chip--extra", held && "entity-chip--locked"]
        .filter(Boolean)
        .join(" ")}
      // 點它 ＝ 改它（描述與人數一起回到輸入框）。`mousedown` 而非 `click`：見 entity-field.tsx。
      // 握著一筆時只擋住、不放行，但 `preventDefault` 一定要照做 —— 少了它這一下會 blur，
      // 而 blur 會把手上那一筆定案。
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
          if (held) return; // 動不得的時候連 × 也動不得
          onCommit(extras.filter((x) => x !== extra));
          input.current?.focus();
        }}
      >
        ×
      </button>
    </span>
  );

  /**
   * 編輯中的那一筆**看起來還是一顆 chip**（同實體欄位）—— 記號、邊框、× 都留著，只有裡面
   * 那段字換成可以打的。少了這一層，點下去的那一刻 chip 整個變成裸字，整排跟著位移。
   */
  const inputNode = (
    <span key="input" className={held ? "entity-field__input-chip" : "entity-field__input-wrap"}>
      {held && (
        <span className="entity-chip__mark" aria-hidden="true">
          {EXTRA_MARK}
        </span>
      )}
      <input
        ref={takeInput}
        // 夾在 chip 中間時寬度依內容而定；只是一個游標插在中間時寬度固定（見 entity-field）。
        className={[
          inline && "entity-field__input--inline",
          caretOnly && "entity-field__input--caret",
        ]
          .filter(Boolean)
          .join(" ")}
        size={inline ? columns(text) : undefined}
        placeholder={extras.length > 0 ? "" : placeholder}
        aria-label={placeholder}
        aria-describedby={describedBy}
        aria-keyshortcuts={describedBy ? HELP_KEY_HINT : undefined}
        aria-expanded={rows.length > 0 || heldNote != null}
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
          // 空著離開 ＝ 放手（`commitText` 沒字時直接 return，不清任何東西）。
          if (!text.trim()) letGo();
        }}
      />
      {held && (
        // 編輯中那一顆的 × 與唯讀 chip 的 × 同一個意思：把這一批從這一場拿掉。
        <button
          type="button"
          className="entity-chip__remove"
          tabIndex={-1}
          aria-label={`移除${held.description}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setText("");
            letGo();
            input.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </span>
  );

  const row = chipRow({
    chips: extras.map((extra, i) => chipNode(extra, i)),
    input: inputNode,
    inputAt,
    bare: caretOnly,
    locked: held != null,
    moveCaret: (at) => {
      caret.current = at;
      redraw();
    },
    focusInput: () => input.current?.focus(),
  });

  return (
    <div className="entity-field extras-field">
      {row}

      {preview.length > 0 && (
        <ul className="entity-field__menu entity-field__menu--preview" aria-hidden="true">
          {preview.map((description) => (
            <li key={description}>
              {EXTRA_MARK} {description}
            </li>
          ))}
        </ul>
      )}

      {(rows.length > 0 || heldNote) && (
        <ul className="entity-field__menu" role="listbox" aria-label={`${placeholder}建議`}>
          {heldNote && (
            <li role="presentation" className="entity-field__menu-hint">
              {heldNote}
            </li>
          )}
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
