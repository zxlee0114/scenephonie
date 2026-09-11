/**
 * 人數：一個**有好幾種樣子的值**（票券 41 的核心裁決，票券 44 落地）。
 *
 * 劇本裡的群演人數多半是估的 —— 真正請幾個人是劇組看預算與場地決定的。所以人數不是
 * 「一個數字」，也不是「`number` 或 null」：**「若干」是編劇自己寫劇本時就在用的寫法**
 * （「一些人」「數人」同義），它是一個他真的會選的答案，不是「未填」的委婉說法。
 *
 * ⚠️ 這個模組**不認中文**。四種樣子裡的「若干」由選單那一列給，不是打出來的
 * —— 見下面 `resolveCountInput` 的分層說明。
 */

/** 全形符號打回半形 —— 注音鍵盤打出來的就是 `＋`／`～`／`〜`／`－`／`—`（票券 41 第二輪）。 */
const halfWidthSymbols = (text: string): string =>
  text.replace(/[＋]/g, "+").replace(/[～〜]/g, "~").replace(/[－—]/g, "-");

/**
 * 全形數字（`１２３`）打回半形 —— 注音鍵盤下的數字常常是全形，那不該變成另一種寫法。
 *
 * **不對外**：票券 45 之後只有一條路認數字 —— `extras.ts` 的尾綴解析整段交給
 * `resolveCountInput`，不自己再正規化一次。各寫一份就會在某一天分岔。
 */
const halfWidthDigits = (text: string): string =>
  text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));

/**
 * 人數的四種樣子（票券 41）。
 *
 * **有 tag、沒有可選欄位**：attr 不允許 undefined（§6.6），而「哪一種樣子」必須讀得出來，
 * 不能靠「哪個欄位剛好有值」去猜 —— `{ from, to }` 兩個都在與只有 `from` 在，是兩種
 * 得靠讀者自己推的形狀。
 */
export type CountValue =
  /** 確切：編劇打了一個數字（`8` → `路人（8）`）。 */
  | { kind: "exact"; count: number }
  /** 區間：`3-5`／`3~5` → `路人（3-5）`。 */
  | { kind: "range"; from: number; to: number }
  /** 下限：`10+` → `路人（10+）`。 */
  | { kind: "atLeast"; count: number }
  /** 若干：選單那一列（`路人（若干）`）—— **編劇真的會選的答案**，不是「沒填」。 */
  | { kind: "some" };

/** 人數輸入格的狀態：還沒說／讀出一個值／讀不出來（打到一半也在這一格）。 */
export type CountInputResult =
  | { state: "empty" }
  | { state: "parsed"; value: CountValue }
  | { state: "unreadable"; raw: string };

/**
 * 人數輸入格裡的那串字讀成什麼（**第一層：狀態解析**）。
 *
 * 這個函式**一個中文字都不認**，包括「若干」—— 「若干」是選單上的一列，不是打出來的。
 * 分層的理由（使用者裁決 2026-09-12）：解析與文案混在一起時，每一種輸入都得用 jsdom
 * 打字、讀 DOM 才測得到；切開之後兩邊都是純函式，在 Node 上跑。
 *
 * **中文數字（`三`、`十`、`廿`、`數十`）先不做**（使用者裁決 2026-09-12）：`十` 與 `十幾`、
 * `二三十` 的邊界是另一個問題，而「數十」其實就是「若干」那一格想講的事。不做不等於要擋
 * —— 讀不出來就整串當描述，那條路已經在了（票券 41 第五輪）。這行註解在這裡，是為了讓下一個
 * 人不必再問一次。
 *
 * 讀不出來時 `raw` 是編劇**打的原字**（只去頭尾空白），不是正規化之後的 —— 那一行警告要
 * 引用他看得懂的東西。
 */
export function resolveCountInput(text: string): CountInputResult {
  const raw = text.trim();
  if (!raw) return { state: "empty" };

  // 空白只在**符號兩側**不帶意思（`3 - 5` 與 `3-5` 是同一件事）。數字之間的空白不吃 ——
  // `1 0` 沒有一個誠實的讀法，把它接成 10 會給出一個編劇沒打過的數字，而且那一行提示會
  // 理直氣壯地預覽它。讀不出來就讀不出來。
  const normalized = halfWidthSymbols(halfWidthDigits(raw)).replace(
    /[\s\u3000]*([-~+])[\s\u3000]*/g,
    "$1",
  );
  const unreadable: CountInputResult = { state: "unreadable", raw };

  const exact = /^(\d+)$/.exec(normalized);
  if (exact) {
    const count = Number(exact[1]);
    // `0` 讀不出來：0 個背景演員等於沒有這一筆（同票券 09 對 `x0` 的裁決）。
    return count >= 1 ? { state: "parsed", value: { kind: "exact", count } } : unreadable;
  }

  const atLeast = /^(\d+)\+$/.exec(normalized);
  if (atLeast) {
    const count = Number(atLeast[1]);
    return count >= 1 ? { state: "parsed", value: { kind: "atLeast", count } } : unreadable;
  }

  const range = /^(\d+)[-~](\d+)$/.exec(normalized);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < 1 || to < from) return unreadable; // 倒過來的區間不替編劇對調 —— 那是猜他的意思。
    // 兩端相同就是確切：`路人（3-3）` 印出來像壞掉，而它說的事與 `路人（3）` 完全一樣。
    return from === to
      ? { state: "parsed", value: { kind: "exact", count: from } }
      : { state: "parsed", value: { kind: "range", from, to } };
  }

  return unreadable;
}

/** 「若干」那一列印的字 —— 顯示與選單共用同一份，兩邊不會各寫各的。 */
export const SOME_LABEL = "若干";

/** 括號裡的那一段：`8`／`3-5`／`10+`／`若干`（票券 45 的 `formatExtra` 會吃同一份）。 */
export function formatCount(value: CountValue): string {
  switch (value.kind) {
    case "exact":
      return String(value.count);
    case "range":
      return `${value.from}-${value.to}`;
    case "atLeast":
      return `${value.count}+`;
    case "some":
      return SOME_LABEL;
  }
}

/**
 * 人數輸入格底下那一行唯讀提示（**第二層：文案生成**）。
 *
 * 它**不含任何解析規則** —— 只把 `resolveCountInput` 的狀態翻成話。一行兩用（票券 41
 * 第二、三輪）：空著是格式說明、讀得出來是預覽、讀不出來是警告。**它永遠有話說**，因為
 * 它回答的始終是同一個問題：「我現在按下去會得到什麼」（票券 40 給第一列立的規矩）。
 * 預覽一旦會消失，它就變成一個有時候在、有時候不在的東西，那比沒有更難讀。
 *
 * `fallback` 是**現在離開會記成什麼**：新增時是若干（他確實沒說），修改時是原值
 * （他沒說要改，票券 41 第七、九輪）。
 */
export function countHintText(
  result: CountInputResult,
  fallback: CountValue,
  description: string,
): string {
  const shown = (value: CountValue) => `${description}（${formatCount(value)}）`;
  switch (result.state) {
    case "empty":
      return "人數（8）、區間（3~5、3-5、10+）";
    case "parsed":
      return shown(result.value);
    case "unreadable":
      return `⚠️ 「${result.raw}」還讀不出來 —— 現在離開會記成「${shown(fallback)}」`;
  }
}

/**
 * 一種樣子算得出的**下限**（票券 41「排序與加總」那一條）。
 *
 * 若干回 `null` —— 它沒有下限，而 `1` 會是系統自己宣告的數字，正是這一串票要消滅的東西。
 * 加總一律不做：把 `3-5` 與 `10+` 加起來得到的數字沒有人能解釋。
 */
export function countLowerBound(value: CountValue): number | null {
  switch (value.kind) {
    case "exact":
    case "atLeast":
      return value.count;
    case "range":
      return value.from;
    case "some":
      return null;
  }
}

/**
 * 讀取路徑的容忍（§6.6）：一團未知的東西是不是一個人數值。
 *
 * 壞形狀不丟例外、回 `null`，由呼叫端決定補什麼 —— 寧可少讀一個數字，也不能因為一個歪掉的
 * attr 就讓整份稿印不出來。
 */
export function countValueOf(raw: unknown): CountValue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { kind, count, from, to } = raw as Record<string, unknown>;
  const positive = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1;
  switch (kind) {
    case "exact":
    case "atLeast":
      return positive(count) ? { kind, count } : null;
    case "range":
      if (!positive(from) || !positive(to) || to < from) return null;
      // 兩端相同收斂成確切 —— 同 `resolveCountInput`，否則 `路人（3-3）` 會從讀取路徑溜回畫面上。
      return from === to ? { kind: "exact", count: from } : { kind: "range", from, to };
    case "some":
      return { kind: "some" };
    default:
      return null;
  }
}

/**
 * 遷移窗口裡那個**舊欄位**該填什麼：一種樣子算得出的下限，若干沒有下限只好填 1（票券 44）。
 *
 * 這條規則原本以 `countLowerBound(v) ?? 1` 的樣子散在好幾個寫入端與讀取端 —— 同一句話沒有
 * 名字，就會有人只改其中一處。⚠️ 那個 1 就是**會說謊的那一個**（`路人（若干）` 的舊欄位是 1，
 * 不是「一個人」的意思）；票券 50 刪掉 `count` 時，要刪的就是這個函式與它的呼叫端。
 */
export function legacyCount(value: CountValue): number {
  return countLowerBound(value) ?? 1;
}

/**
 * 拉走一個人之後，那批人**剩下的樣子**；`null` ＝ 這一批就沒有了（票券 46）。
 *
 * 升格（票券 35）把一個人從背景演員裡拉出來變成人物，那批人因此少一個。這個函式是
 * 「`3-5` 減一是多少」的**唯一真相來源** —— 措辭那一側（票券 49 的「群演剩 2-4 人」）
 * 吃的是它的回傳值，畫面不自己算。
 *
 * | 原值 | 剩下 |
 * |---|---|
 * | `8` | `7` |
 * | `3-5` | `2-4` |
 * | `10+` | `9+` |
 * | `若干` | `若干` |
 * | `1` | 整筆移除（`null`） |
 *
 * ⚠️ **只有「確切」走得到「減到 0 就整筆移除」**（票券 35 那條裁決因此是**加一個條件、
 * 不是被推翻**）：區間、下限、若干本來就沒有說死有幾個人，拉走一個不會讓那批人消失。
 *
 * 有數字的那幾端**減不到 1 以下**：0 不是四種樣子裡的任何一種，而「說不定沒有人了」這件事
 * 這四種樣子都說不出來。`1+` 拉走一個仍然是 `1+`、`1-3` 是 `1-2` —— 下限最多高估一個人，
 * 但上限與「這批人還在」都是真的，那是四種樣子裡最接近的一種說法。
 */
export function countAfterTakingOne(value: CountValue): CountValue | null {
  /** 減一，但踩在 1 上不動（見上面那段）—— 確切那一種走的是另一條路，它減得到 0。 */
  const minusOne = (n: number) => Math.max(1, n - 1);
  switch (value.kind) {
    case "exact":
      // 0 個背景演員等於沒有這一筆（票券 09 對 `x0` 的裁決，同 `parseExtra`）。
      return value.count > 1 ? { kind: "exact", count: value.count - 1 } : null;
    case "range": {
      const from = minusOne(value.from);
      const to = minusOne(value.to);
      // 兩端相同收斂成確切 —— 同 `countValueOf`，否則 `路人（2-2）` 會從這裡溜出去。
      return from === to ? { kind: "exact", count: from } : { kind: "range", from, to };
    }
    case "atLeast":
      return { kind: "atLeast", count: minusOne(value.count) };
    case "some":
      return { kind: "some" };
  }
}
