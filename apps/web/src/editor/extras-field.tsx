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
 *
 * ── 人數走一層子選單（票券 48）──────────────────────────────────────
 * 名稱那一關多一列 `修改數量…`，按下去進**人數子選單**（`stage`）：第一列是
 * `↰ 不修改數量（8），回上一步`，接著 `若干`、`1`、一個自由輸入格。挑完退回名稱那一關，
 * 名稱還能接著改。
 *
 * 兩條規則撐著整層：
 *
 * 1. **預設值印在看得見的地方。** 第一列說的就是「按下去會得到什麼」（票券 40 立的規矩）。
 *    修改路徑上那個值是**原值或待定值，不是「若干」** —— 寫成「若干」會讓實作在修改時偷偷
 *    抹掉編劇原本說過的 8（票券 41 第七輪推翻第一版）。空著 Enter、打到一半 Enter、點到
 *    外面：三者取的都是它。
 * 2. **待定人數是編輯狀態的一部分**（`pendingCount`）。挑了 2、回到名稱那一關時，那一批
 *    **還沒變** —— 變的是「按下去會得到什麼」，所以它不寫回 doc，只餵給 `readText`。
 *
 * `↰` 與 `↩︎` 是**兩列**，即使在這一層按下去的結果看起來相近（使用者裁決 2026-09-12）：
 * 前者退一階、名稱那一側的待定改動留著；後者整輪作廢。導航語意不因為結果重疊就合併。
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
  SOME_LABEL,
  countHintText,
  extraCount,
  formatCount,
  formatExtra,
  legacyCount,
  mintExtraId,
  parseExtra,
  resolveCountInput,
  splitNamesLive,
  type CountValue,
  type ExtraRef,
} from "@scenephonie/schema";

import { useChipCaret } from "./chip-caret";
import { chipRow, columns } from "./chip-row";
import {
  BACK_MARK,
  CONFIRM_MARK,
  EXTRA_MARK,
  HINT_MARK,
  NEW_MARK,
  PUT_BACK_MARK,
  RENAME_MARK,
} from "./field-marks";
import { HELP_KEY_HINT } from "./field-info";
import { historyKey } from "./history-keys";

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

/**
 * 選單上的一格。多數是**一列可以按的字**；人數那一層另外有一格是**輸入框**（票券 48）。
 *
 * 輸入框跟著進同一個陣列，是因為 ↑↓ 要停得進去：它在版面上夾在 `1` 與 `↩︎ 不修改，返回`
 * 中間，兩側都還有列。把它排除在導航之外，那兩側就會在同一顆方向鍵下互相跳過對方。
 */
type Row =
  | { key: string; box?: false; label: string; run: () => void }
  | { key: "count-box"; box: true };

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
  /**
   * 選單走到**哪一層**（票券 48）—— `"describe"` 是名稱那一關，`"count"` 是人數子選單。
   *
   * 住在 ref 而不是 state，因為焦點在兩個輸入框之間換手時要**同步**讀得到它：把焦點移進
   * 人數格會立刻在名稱框上觸發 `blur`，而那個 handler 平常做的是「定案並收工」。`setState`
   * 要等下一次重繪才看得見，那一刻它讀到的還是 `"describe"`，整輪編輯就被自己的焦點切換
   * 收掉了。同檔案裡 `editing`／`caret` 用 ref 的理由也是這一條。
   */
  const stage = useRef<"describe" | "count">("describe");
  /**
   * **待定人數** —— 在人數子選單裡挑過、但還沒按下確認的那個值（票券 48）。
   *
   * 它是編輯狀態的一部分，`null` ＝ 沒挑過（用手上那一批的現值）。挑完退回名稱那一關時
   * 這一批**還沒變**，變的是「按下去會得到什麼」—— 所以它不寫回 doc，只餵給 `readText`。
   *
   * 住在 ref 而不是 state，理由同 `stage`：離開人數格的那一下要**同步**用到它 —— 點到欄位
   * 外面時，「把框裡那串字讀成待定值」與「定案」發生在同一個 handler 裡，`setState` 要等
   * 下一次重繪才看得見，那一刻定案用的還是舊值，剛打的人數就無聲掉了。
   */
  const pendingCount = useRef<CountValue | null>(null);
  /** 人數輸入格裡那串字。子選單一關就清掉 —— 讀不出來的半截字不該留到下一次。 */
  const [countText, setCountText] = useState("");
  const countInput = useRef<HTMLInputElement>(null);
  /** 這一欄的外框 —— 只為了問一個問題：焦點離開人數格之後，人還在這一欄裡嗎。 */
  const field = useRef<HTMLDivElement>(null);
  /** 下一次重繪之後把焦點送去哪：`"count"` ＝ 人數格，`"name"` ＝ 名稱框（游標停字尾）。 */
  const focusNext = useRef<"count" | "name" | null>(null);
  const takeInput = (el: HTMLInputElement | null) => {
    input.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el;
  };

  useEffect(() => {
    if (selectNext.current) {
      selectNext.current = false;
      input.current?.select();
    }
    const to = focusNext.current;
    if (!to) return;
    focusNext.current = null;
    if (to === "count") {
      countInput.current?.focus();
      return;
    }
    // 回到名稱那一關：**不反白**，游標停在字尾（票券 48 驗收）。整串反白是「這是從 chip 上
    // 拿下來的舊東西，多半要整個換掉」的訊號（`editExtra`）；從人數那一層回來的編劇剛剛
    // 才在改這串字，下一顆鍵把它清光等於白挑一次人數（同票券 37 對 ⌘Z 的裁決）。
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  const reset = () => {
    editing.current = null;
    // `caret` 不清 —— `add` 剛把它挪到新 chip 之後，那就是游標該在的地方。
    setText("");
    setActive(0);
    setDismissed(false);
    leaveCountStage();
  };

  /** 收掉人數那一層：層數、待定值、格子裡的半截字一起清（票券 48）。 */
  const leaveCountStage = () => {
    stage.current = "describe";
    pendingCount.current = null;
    setCountText("");
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
    if (!description) return null;
    // ⚠️ 遷移窗口裡**兩個形態要一起寫**（票券 44）：只改 `countValue` 會讓舊欄位說謊，
    // 而升格（票券 46）此刻還在讀它。`legacyCount` 是那條規則唯一的住處。
    const value = heldCount(held);
    return { description, count: legacyCount(value), countValue: value };
  };

  /**
   * 手上那一批**現在算什麼人數** —— 挑過就是待定值，沒挑過就是它自己的現值（票券 48）。
   *
   * 「現在的樣子」只有這一個答案，所以第一列（`↰ 不修改數量（8）`）、那一行提示的
   * `fallback`、以及定案寫回去的值全部走這一支。
   */
  const heldCount = (held: ExtraRef): CountValue => pendingCount.current ?? extraCount(held);

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
    leaveCountStage(); // 手上沒東西了，待定人數也就沒有主人
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
   * **整輪編輯作廢** —— 手上那一筆原封回到它原本那一格，框裡打的字丟掉。
   *
   * 這是 `↩︎ 不修改，返回` 那一列（票券 42 第 2 條：選單走到哪一階段它都要在，因為
   * 「編劇可能隨時都會反悔」）。它與 `↰ 回上一步` 是兩件事，別因為某一階段結果相同就合併。
   */
  const putBack = () => {
    const held = editing.current;
    if (!held) return;
    // 焦點送回名稱框。人數那一層按下它時，焦點正停在**即將被卸掉**的那個格子上，而節點被
    // 移除時瀏覽器不發 `blur` —— 少了這一句，焦點會掉到 `body`，下一顆鍵誰都收不到
    // （code review 2026-09-12）。名稱那一關按它時焦點本來就在那裡，這一句是無害的重申。
    focusNext.current = "name";
    const at = Math.min(caret.current ?? extras.length, extras.length);
    caret.current = at + 1;
    onCommit([...extras.slice(0, at), held, ...extras.slice(at)]);
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

  /**
   * 進**人數子選單**（`修改數量…` 那一列，票券 48）。
   *
   * 焦點搬到人數格 —— 名稱那一側的字原封留著，它只是不再是現在要打的東西。
   */
  const openCountStage = () => {
    if (!editing.current) return;
    stage.current = "count";
    setCountText("");
    setActive(-1); // 一進來就停在**格子**上（見 `boxIndex`）—— 那是這一刻要打字的地方
    focusNext.current = "count";
    redraw();
  };

  /** 退回**名稱那一關**（`↰`、Esc，以及挑完人數之後）—— 名稱那一側的待定改動留著。 */
  const backToDescribe = () => {
    stage.current = "describe";
    setCountText("");
    setActive(0);
    focusNext.current = "name";
    redraw();
  };

  /** 挑一個人數（`若干`、`1`）：記成待定值，退回名稱那一關。 */
  const pickCount = (value: CountValue) => {
    pendingCount.current = value;
    backToDescribe();
  };

  /** 框裡那串字讀得出來就記成待定值；讀不出來就不動（於是留著的是第一列那個值）。 */
  const takeCountText = () => {
    const result = resolveCountInput(countText);
    if (result.state === "parsed") pendingCount.current = result.value;
  };

  /**
   * 離開人數格 —— **讀得出來就用它，讀不出來就是第一列的值**（票券 48）。
   *
   * 空著 Enter、打到一半 Enter、點到外面：三者同一個結果。`blur` 擋不住（點到外面就是走了），
   * 所以 Enter 若擋住、blur 不擋，同一個念頭就有兩種結果，而且其中一種看不見。
   *
   * ⚠️ 讀不出來時回到的是**原值或待定值**，不是「若干」（票券 41 第七輪推翻第一版）——
   * 在修改這條路上寫成「若干」等於系統偷偷抹掉編劇原本說過的 8。新增那一側的第一列本來
   * 就是「若干」，所以那邊的結果不變（票券 49）。
   */
  const commitCount = () => {
    takeCountText();
    backToDescribe();
  };

  /**
   * **焦點離開人數格**（票券 48 的「點到外面」）。
   *
   * 框裡那串字照樣先讀掉 —— 三種離開法（空著 Enter、打到一半 Enter、點到外面）取的是同一個
   * 值。差別只在**人去了哪裡**：
   *
   * - 還在這一欄裡（例如點回名稱框）：只退一階，焦點**不搶回來** —— 他正要點的那一格就是
   *   他要的那一格。
   * - 欄位外面：那一下與名稱框的 blur 逐字同一套（打完就走是常態、空著離開 ＝ 放手）。
   *   人數這一關擋不住他走，所以這一輪編輯照樣要有結果。
   */
  const leaveCountBox = (next: EventTarget | null) => {
    if (stage.current !== "count") return;
    takeCountText();
    stage.current = "describe";
    setCountText("");
    setActive(0);
    const inside = next instanceof Node && field.current?.contains(next);
    if (!inside) {
      if (!composing.current) commitText();
      if (!text.trim()) letGo();
    }
    redraw();
  };

  const query = text.trim();
  const parsed = readText(text);
  /**
   * 選單開著嗎 —— 框裡有字，**或**手上握著一批。
   *
   * 後者是為了那條退路（使用者回報 2026-09-12：「chip 內空字串時沒有不修改的選項」）：
   * 字刪光的那一刻只剩一個 chip 外殼，而那正是最需要看見「這一輪還能整個放棄」的時候。
   * 沒握著東西、框又是空的 —— 那時選單整個不出現（沒有話可說）。
   */
  const menuOpen = !composingNow && !dismissed && (query.length > 0 || editing.current != null);

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
  const heldForCount = stage.current === "count" ? editing.current : null;
  if (heldForCount) {
    /**
     * ── 人數子選單（票券 48）──────────────────────────────────────
     *
     * 第一列**把預設值搬到看得見的地方**：`↰ 不修改數量（8），回上一步`。第七輪提的
     * `8（原訂）` 解決的是同一個坑 —— 第二關的預設若是「若干」，修改時它會偷偷抹掉原本
     * 的 8；把那個值印在畫面上，坑就不存在了。再進來時它跟的是**待定值**（挑過 2 之後是
     * `不修改數量（2）`），因為那才是「現在的樣子」。
     *
     * 沒有 `10+／20+／30+／40+` 那道階梯（編劇：「好像可有可無」）—— 那四個數字是猜的，
     * 而自由輸入格加即時預覽比猜四個數字誠實。
     */
    const now = heldCount(heldForCount);
    rows.push({
      key: "keep",
      label: `${BACK_MARK} 不修改數量（${formatCount(now)}），回上一步`,
      run: backToDescribe,
    });
    // 格子**排在第二列**（緊跟著 `↰`，編劇裁決 2026-09-12）：它是進來之後預設停留的地方，
    // 而原本排在 `若干`／`1` 底下時，按下 `修改數量…` 的那一瞬間焦點會跳到選單的第四列 ——
    // 跳得遠就看不見它跳去哪了。排在第二列，那一跳只有一格。
    // （另一條路是「先把焦點給第一列」，沒有採用：打完 `3~5` 按 Enter 要多點一次框，而
    // 「空著 Enter／打到一半 Enter／點到外面三者同結果」正是靠格子預設被聚焦才成立的。）
    rows.push({ key: "count-box", box: true });
    rows.push({ key: "some", label: SOME_LABEL, run: () => pickCount({ kind: "some" }) });
    // `1` 只在**與第一列不重複**時才印 —— 原本就是 1 的話不必印兩次同一個答案。
    if (formatCount(now) !== "1") {
      rows.push({ key: "one", label: "1", run: () => pickCount({ kind: "exact", count: 1 }) });
    }
    // `↩︎` 在子選單裡**也在**（票券 42 第 2 條：選單走到哪一階段它都要在）。它與第一列
    // 的 `↰` 是**兩列**，即使在這一層按下去的結果看起來相近：`↰` 只退一階、名稱那一側的
    // 待定改動留著；`↩︎` 是整輪作廢，待定人數與名稱改動一起丟（使用者裁決 2026-09-12）。
    rows.push({ key: "put-back", label: `${PUT_BACK_MARK} 不修改，返回`, run: putBack });
  } else if (menuOpen) {
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
    // 框裡讀不出一筆（空著，或只打了 `x8`）時這兩列都沒話說 —— 它們說的都是「按下去會
    // 得到什麼」，而那一刻沒有東西可以得到。`↩︎` 那一列不在這個 if 裡：它說的是別的事。
    if (parsed) {
      const after = formatExtra(parsed);
      const changed = before != null && before !== after;
      // 這一列是 `commitText`（Enter 也走它）—— 變的只有它怎麼自我介紹。字一個都沒改時
      // **它整列不出現**：那一下什麼都沒動，該說的話下面那一列 `↩︎` 已經說完了，印兩次
      // 同一句話只是雜訊。
      if (before == null || changed) {
        rows.push({
          key: "commit",
          // 結果導向（編劇裁決 2026-09-12）：這一列只印**按下去會得到什麼**，不再把
          // 「原本是什麼」一起唸一遍 —— 原值就在抬頭那一行，解說性的文字之後歸側欄。
          label:
            before == null
              ? `${NEW_MARK} 新增群演「${parsed.description}」${parsed.count} 人`
              : `${CONFIRM_MARK} 確認：改成「${after}」`,
          run: commitText,
        });
      }
      // 另外開一批：只在**手上握著一批而且字改了**的時候有話說。沒握著東西時「新增」本來就
      // 是另外一批；字沒改時它只會造出一批一模一樣的，那不是編劇在這一刻要的。
      if (changed) {
        rows.push({
          key: "another",
          // 「另外」兩個字自己就說完了代價（ADR-0006：代價寫在按下去之前）—— 原本那一批
          // 還在。措辭第二輪收成結果導向（編劇裁決 2026-09-12），不再把 `保留「路人（8）」`
          // 唸出來：那是解說，之後歸側欄。
          label: `${NEW_MARK} 另外新增「${after}」群演`,
          run: addAnother,
        });
      }
    }
    // `↩︎ 不修改，返回` —— **握著一批時永遠在**，字改過了在、字刪光了也在（票券 42
    // 第 2 條，使用者回報 2026-09-12 兩則）。它不是「字沒改」那一格的專屬措辭，而是這一輪
    // 編輯的退路：按它就是把那一批原封放回、打的字丟掉。與空框上的 Backspace **是兩件事**
    // ——那一下是放手（這一場從此沒有這一批），抬頭說的就是它，兩條路同時看得見。
    // 沒握著東西時不出 —— 那時沒有一輪編輯可以作廢（票券 42 建議做法第 2 條）。
    if (held) {
      // `修改數量…` 排在 `↩︎` **之前**（票券 48）：它是「還要做別的事」，不是「結束」。
      // 那一層的合約寫在 `openCountStage`／`commitCount` 上。
      rows.push({ key: "count", label: `${RENAME_MARK} 修改數量…`, run: openCountStage });
      rows.push({ key: "put-back", label: `${PUT_BACK_MARK} 不修改，返回`, run: putBack });
    }

    // 補字串那幾列只在框裡真的有字時才比對 —— 空字串誰都命中，那不是自動補全。
    for (const description of query.length > 0 ? hits() : []) {
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
  /**
   * 人數格底下那一行提示 —— **永遠有話說**（票券 40 給第一列立的規矩、票券 44 的 `countHintText`）。
   *
   * 它回答的始終是同一個問題：「我現在按下去會得到什麼」。所以它不會因為讀不出來就消失，
   * 只是換一副語氣：空著是格式說明、讀得出來是預覽、讀不出來是警告（而且**說得出現在離開
   * 會記成什麼** —— 那就是 `fallback`，也就是第一列的值）。
   */
  const countHint = heldForCount
    ? countHintText(
        resolveCountInput(countText),
        heldCount(heldForCount),
        parsed?.description ?? heldForCount.description,
      )
    : null;

  const heldNow = editing.current;
  /**
   * 抬頭的措辭（票券 48，編劇逐字指定 2026-09-12）—— **兩態**，差別在人數挑過沒有。
   *
   * 它取代票券 47 那句（`改的是名稱 —— 數量保留，不必手動重寫`），理由是**指路**：47 那句
   * 只說了「數量保留」，沒說「那要怎麼改數量」。這一版把那條路寫在唯一會讀到它的時刻。
   * ⚠️ 所以它必須與 `修改數量…` 那一列**同時上線**（那一列也是這張票造的）—— 先換文案
   * 等於叫編劇去點一個不存在的選項。
   *
   * **名稱那一段印的是原值**（「我在編輯誰」），**人數那一段跟著待定值走**（挑過 2 之後說
   * 「數量已更新為 2」）。「我打算改成什麼」是第一列的事（票券 36 的分工）。
   */
  const editHeadline = (held: ExtraRef): string =>
    pendingCount.current
      ? `正在編輯「${held.description}」群演，數量已更新：${formatCount(pendingCount.current)}`
      : `正在編輯「${held.description}」群演，原本數量「${formatCount(extraCount(held))}」保留`;
  const heldNote = !heldNow
    ? null
    : heldForCount
      ? // 人數那一層的抬頭。跟的是**原值**（`原本是 8`），第一列才跟待定值 —— 兩者一起看
        // 才讀得出「我把它從 8 改成了 2」。
        `${HINT_MARK} 修改數量（原本是 ${formatCount(extraCount(heldForCount))}）`
      : dismissed || composingNow
        ? null
        : query === ""
          ? `${HINT_MARK} 正在編輯「${formatExtra(heldNow)}」，再按一次 Backspace 移除這一批`
          : `${HINT_MARK} ${editHeadline(heldNow)}`;

  /**
   * 人數格在第幾列 —— `-1` ＝ 這一層沒有格子（名稱那一關）。
   *
   * `active` 用 `-1` 代表「停在格子上」：進子選單時那一格還沒有位置可以指（列是在這之後
   * 才長出來的），而它必須是**預設停留的地方** —— 打完 `3~5` 按 Enter 要的是那串字，不是
   * 第一列。方向鍵一走進列上，`active` 就變回一個真的索引。
   */
  const boxIndex = rows.findIndex((r) => r.box === true);
  const activeIndex =
    active < 0 && boxIndex >= 0 ? boxIndex : Math.min(Math.max(active, 0), rows.length - 1);
  const activeRow = rows[activeIndex];

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

  /**
   * 人數格上的鍵盤（票券 48）。
   *
   * ↑↓ 在整層裡跑（格子自己是其中一格），Enter 打在停著的那一格上 —— 停在格子上時就是
   * 「把框裡那串字讀掉」（`commitCount`）。**Esc 等同 `↰`**：退一階、名稱那一側的字留著。
   *
   * ⌘Z／⌘⇧Z **留在這個框裡，一步都不出去**（使用者裁決 2026-09-12）：欄位的鍵不該有欄位
   * 以外的後果。框裡有字時那一下是原生 undo，字自己回來（**沿用票券 37**，這裡沒有另寫一套
   * undo）；字退光之後框是空的、它自己的歷史到底了 —— 那一下就什麼都不做，游標留在空框上。
   *
   * ⚠️ 這一行 `stopPropagation` 就是「不出去」的全部：沒有它，空框那一下會往上冒到 chip row
   * 的 `forwardHistoryKey`、再冒到 window 的 `strayHistoryKey`，兩者都只問「框裡有沒有沒定案
   * 的字」（`typingInField`），答不出「這一欄手上握著東西嗎」，於是把「剛拿起這一批」那一步從
   * 文件退回來 —— 畫面上同一批人變成兩份（使用者回報 2026-09-12，票券 54 的人數格入口）。
   * 不 `preventDefault`：那會連框自己的原生 undo／redo 一起擋掉，而框裡有字時那正是要的東西。
   */
  const countKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing.current) return; // 組字中每一顆鍵都還給 IME
    if (historyKey(event)) {
      event.stopPropagation();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (activeRow && !activeRow.box) activeRow.run();
      else commitCount();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      backToDescribe();
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing.current) return; // 組字中每一顆鍵都還給 IME

    if (rows.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((activeIndex + 1) % rows.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((activeIndex - 1 + rows.length) % rows.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (activeRow && !activeRow.box) activeRow.run();
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
          // 焦點只是搬去人數格 —— 這一輪編輯還在進行中（票券 48）。少了這一行，「按下
          // `修改數量…`」會被名稱框自己的 blur 當成「打完就走」而當場定案收工。
          if (stage.current === "count") return;
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
    <div ref={field} className="entity-field extras-field">
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
          {rows.map((row, i) =>
            row.box ? (
              /**
               * 自由輸入格與它底下那一行提示（票券 48）。
               *
               * ⚠️ 與票券 36「標籤放結果、說明另外放」的分工**不衝突**（實作前對過）：那條
               * 管的是**選項列**——一列的標籤只印按下去的結果，解釋另外放一行唯讀的。這裡
               * 兩個東西**都不是選項列**：格子是輸入、提示是唯讀（`role="presentation"`、
               * 選不到、Enter 碰不到，同 `heldNote`）。所以這一格套的是 36 的另一半：說明
               * 歸說明，一行字不兼職當選項。
               */
              <li
                key={row.key}
                role="presentation"
                className="entity-field__menu-box"
                // 點在**格子以外**的地方（那一行提示、這一列的內距）不該把框 blur 掉 ——
                // 那一行提示就貼在框底下一格，點它多半只是想把它讀清楚。少了這一句，那一下
                // 會被 `leaveCountBox` 當成「人走了」而把整輪編輯定案（code review 2026-09-12）。
                // 格子本身不擋 —— 擋了連游標都點不進去。
                onMouseDown={(e) => {
                  if (e.target !== countInput.current) e.preventDefault();
                }}
              >
                <input
                  ref={countInput}
                  className="entity-field__count-input"
                  aria-label="人數"
                  value={countText}
                  onChange={(e) => {
                    setCountText(e.target.value);
                    setActive(-1); // 打字就是停在格子上
                  }}
                  // 空格子看起來像「這一列壞了」。placeholder 只說**這一格要填什麼**，
                  // 格式舉例留給底下那一行提示（票券 36 的分工：一行字不兼職）。
                  placeholder="輸入人數"
                  onKeyDown={countKeyDown}
                  onFocus={() => setActive(-1)}
                  // 點到外面與 Enter 同一個結果（票券 48）—— `blur` 擋不住，兩者若分岔，
                  // 同一個念頭就有兩種結果，而且其中一種看不見。
                  onBlur={(e) => leaveCountBox(e.relatedTarget)}
                />
                {countHint && <p className="entity-field__count-hint">{countHint}</p>}
              </li>
            ) : (
              <li
                key={row.key}
                role="option"
                aria-selected={i === activeIndex}
                className={i === activeIndex ? "is-active" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  row.run();
                }}
              >
                {row.label}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
