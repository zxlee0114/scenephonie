/**
 * 群演 —— **場次限定實體**的那一半值語意（§4.7、CONTEXT.md 詞條「群演」）。
 *
 * 群演不是人物：它缺乏跨場次的身分連續性（第 3 場的路人與第 7 場的路人不是同一批人）。
 * 所以這裡**沒有目錄、沒有實體表、沒有 `EntityDirectory`** —— `extraId` 只在該場次內有意義，
 * 它的家就是那個場次的 `extras` attr。「這筆群演在嗎」問的是本場的清單，不是專案。
 *
 * ⚠️ 因此**跟著場次被複製時一起複製、不去重**（§6.5 那條規則的適用範圍只有 `sceneId`）：
 * 複製出來的那一場有自己的一批背景演員，兩份 id 相同不構成碰撞，因為它們從來不在同一個
 * 命名空間裡比較。想「順手把它也去重」之前先讀這一段。
 *
 * ── 描述的跨場次自動補全只補字串 ───────────────────────────────────────
 * 打「咖啡廳客人」時可以補上別場用過的同一串字，但**不建立任何連結** —— 不做「這是同一批人」
 * 的假承諾。這是與人物／地點**刻意相反**的設計：那兩者的自動補全命中的是一筆實體（`{ id, 顯示名 }`），
 * 這裡命中的只是幾個字。
 */
import {
  countLowerBound,
  countValueOf,
  formatCount,
  resolveCountInput,
  SOME_LABEL,
  type CountValue,
} from "./count";
import { mintId } from "./ids";
import type { ExtraRef } from "./schema";

/** 群演 id 的前綴。使用者永遠看不到（同 `sc_`／`ch_`／`lo_`）。 */
export const EXTRA_ID_PREFIX = "ex_";

export function mintExtraId(): string {
  return mintId(EXTRA_ID_PREFIX);
}

export function isExtraId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(EXTRA_ID_PREFIX) &&
    value.length > EXTRA_ID_PREFIX.length
  );
}

/**
 * 場次 `extras` attr 的讀取正規化。
 *
 * attr 不允許 null（空陣列就是「沒有」，不參與草稿完整性判定），但讀取路徑一律**容忍壞形狀**
 * （§6.6）—— 寧可少讀一筆，也不能因為一個歪掉的 attr 就讓整份稿印不出來。
 *
 * 人數壞掉時**不丟掉這一筆**，補成**「若干」**（票券 45）：描述才是那一筆的內容，而壞掉的
 * 人數說的是「這裡不知道」—— 補 1 會讓系統自己宣告一個數字，那正是票券 41 要消滅的東西。
 * 沒有 `extraId` 的才丟 —— 那一筆沒有身分，對白的人物欄指不到它，留著也沒有人用得上。
 *
 * 人數在遷移窗口裡有兩個形態，這裡**兩邊都填**（票券 44）—— 規則見底下的 `bothShapes`。
 */
export function sceneExtras(value: unknown): ExtraRef[] {
  if (!Array.isArray(value)) return [];
  const out: ExtraRef[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const { extraId, description, count, countValue } = raw as Record<string, unknown>;
    if (!isExtraId(extraId) || typeof description !== "string") continue;
    out.push({ extraId, description, ...bothShapes(count, countValue) });
  }
  return out;
}

/**
 * 舊欄位自己推得出來的那一種樣子：正整數是「確切 N」，其餘是「若干」。
 *
 * 一份、兩個呼叫端（`bothShapes` 與 `formatExtra`）—— 遷移窗口裡「舊資料怎麼讀」只能有
 * 一個答案，而票券 50 刪掉 `count` 時要刪的也就是這一個地方。
 */
function legacyCountValue(count: unknown): CountValue {
  return Number.isInteger(count) && (count as number) >= 1
    ? { kind: "exact", count: count as number }
    : { kind: "some" };
}

/**
 * 遷移窗口裡的人數：**兩個形態都填得出來**（票券 44 的 expand）。
 *
 * - 舊資料只有數字 → 新形態由它推出「確切 N」
 * - 新形態在 → 舊欄位填它的下限（若干沒有下限，只好填 1 —— ⚠️ 那個 1 就是會說謊的那一個）
 *
 * **兩個數字打架時舊的那個贏。** 這個窗口裡寫入端只有舊的那一批（command 要到票券 46
 * 才搬），它們動的是 `count`、把 `countValue` 原封不動抄回去 —— 所以一筆
 * `{ count: 1, countValue: 確切 2 }` 說的是「升格拉走了一個人」，不是「有兩個人」。
 * 舊寫入端在這個窗口裡仍然是權威，這條讓它繼續是。
 *
 * ⚠️ **所以票券 45–49 的每一個寫入端都必須兩邊一起寫**：改了 `countValue` 卻讓 `count`
 * 停在原地，讀回來會是舊的那個數字 —— 編劇挑的「若干」「3-5」就這麼不見了，而且不會報錯，
 * 型別也擋不住（`count` 在票券 50 之前是必填的）。寫入端的規矩是
 * `count: countLowerBound(v) ?? 1`，與這裡的填法同一句話。
 *
 * **裸數字讀成「確切 N」是容錯，不是遷移**（票券 45）：它不拿版本號、不寫遷移鏈、不對外
 * 承諾 —— 那一套住在 persistence 裡，而且它管的是「PM node schema 讀不讀得出來」，不是
 * 值語意（票券 50 會把這個分界寫在那一側）。
 * 複製貼上、匯入、測試 fixture 這些路徑繞得過寫入端，而裸數字有一個唯一誠實的讀法，
 * 所以這條在票券 50 把 `count` 刪掉之後仍然留著。反過來，**壞掉的數字補「若干」** ——
 * 那裡沒有一個誠實的讀法可以推。
 *
 * **「若干」不參加打架**：它沒有數字，所以任何 `count` 都不構成矛盾（那個 `?? 1` 只是
 * 舊欄位填得出來的唯一值，不是「一個人」的意思）。票券 50 把 `count` 刪掉之後，
 * 這整個 tie-break 一起消失。
 */
function bothShapes(
  count: unknown,
  countValue: unknown,
): { count: number; countValue: CountValue } {
  const legacyShape = legacyCountValue(count);
  const hasLegacy = legacyShape.kind === "exact";
  const legacy = hasLegacy ? legacyShape.count : 1;
  const stored = countValueOf(countValue);
  const contradicts =
    stored !== null && hasLegacy && stored.kind !== "some" && countLowerBound(stored) !== legacy;
  const shape: CountValue = stored !== null && !contradicts ? stored : legacyShape;
  return { count: countLowerBound(shape) ?? 1, countValue: shape };
}

/** 結尾的一對括號（全形半形都認）。裡面不再有括號 —— `路人（8）（若干）` 只讀最後那一對。 */
const PAREN_SUFFIX = /[（(]([^（()）]*)[)）][\s\u3000]*$/;
/** 結尾的乘號尾綴。後面那一段整段交給 `resolveCountInput` 讀，所以 `x3-5` 也成立。 */
const SYMBOL_SUFFIX = /[\s\u3000]*[xX×＊*][\s\u3000]*([^\s\u3000]*)$/;
/**
 * 結尾的裸尾綴：**必須含一個符號**（`+＋`／`~～〜`／`-－—`），否則就是名字。
 *
 * 這一條就是 ADR-0013 那條線：`路人 8` 整串是名字，`路人 10+` 才是人數。
 */
const BARE_SUFFIX = /[\s\u3000]*([\d０-９][\d０-９\s\u3000]*[+＋~～〜\-－—][\d０-９\s\u3000+＋]*)$/;

/**
 * 人數的尾綴有三種寫法，**都要帶符號**（ADR-0013：裸數字是名字的一部分，不是人數）。
 * 由上而下試，第一種對上的就是答案。
 *
 * 1. 括號：`路人（8）`／`路人（3-5）`／`路人（若干）` —— 這是 `formatExtra` 印出來的那一種，
 *    往返靠它。括號裡是**裸數字也認**，而且只有這一種認得「若干」：括號本身就是編劇的宣告。
 * 2. 乘號：`路人 x8`／`X8`／`×8`／`＊8`／`*8` —— 顯示已經不再印它（票券 45 改成括號），
 *    但**輸入繼續認**：本子裡已經有 `路人 x3` 這種資料，編劇的手也記得 `x8`。
 * 3. 裸的帶符號尾綴：`路人 10+`／`路人 3-5`／`路人 3~5` —— 符號是宣告，所以一次打完也讀得出來。
 *
 * 三種都**只認結尾那一段**。`x` 出現在描述中間（`x 光室的病人`）不是人數 —— 那是名字的
 * 一部分，同「全形半形空白一律視為名字的一部分」那條規則的精神。
 *
 * ⚠️ 對上了但**讀不出來就到此為止**，不往下一種試：`路人（三五個）` 是「括號那一種，內容
 * 讀不出來」，整串退回去當描述（解析是全有全無的）。往下試會讓同一串字有兩種讀法。
 */
const SUFFIX_FORMS = [
  { pattern: PAREN_SUFFIX, allowSome: true },
  { pattern: SYMBOL_SUFFIX, allowSome: false },
  { pattern: BARE_SUFFIX, allowSome: false },
];

/**
 * 尾綴那一段讀成一種樣子；讀不出來回 `null`。
 *
 * 「若干」只有括號那一種認得（`allowSome`）—— 它是選單上的一列，不是 `resolveCountInput`
 * 讀的東西（那個模組一個中文字都不認，見它的檔頭）。
 */
function suffixCount(segment: string, allowSome: boolean): CountValue | null {
  if (allowSome && segment.trim() === SOME_LABEL) return { kind: "some" };
  const resolved = resolveCountInput(segment);
  return resolved.state === "parsed" ? resolved.value : null;
}

/** 一段字尾巴上的人數：認得就回「人數 ＋ 描述那一段到哪裡為止」，認不得回 `null`。 */
function splitCount(text: string): { value: CountValue; end: number } | null {
  for (const { pattern, allowSome } of SUFFIX_FORMS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = suffixCount(match[1] ?? "", allowSome);
    return value ? { value, end: match.index } : null;
  }
  return null;
}

/**
 * 把編劇打的一段字解析成一筆群演：**描述 ＋ 人數**（`咖啡廳客人（8）`、`咖啡廳客人 x8`）。
 *
 * **沒寫人數就是「若干」，不是 1**（票券 45）：打「路人」時系統不憑空生出一個數字 ——
 * 「若干」說的是「他沒說」，而 1 是一個系統自己宣告的答案。
 *
 * **解析是全有全無的**：要嘛從結尾讀出一個認得的人數，要嘛**整串**當描述。所以
 * `路人（三五個）` 得到的不是「一筆人數壞掉的群演」，而是描述叫「路人（三五個）」、人數若干
 * 的一批 —— 資料層的人數永遠只有那四種樣子，一致性不靠使用者守規矩來維持（票券 43）。
 *
 * `x0`／`（0）` 不算人數（0 個背景演員等於沒有這一筆），整串字退回去當描述 —— 系統不替編劇
 * 決定他打的 `x0` 是筆誤還是名字。
 *
 * 描述空白（只打了 `x8`）回 `null`：沒有描述的人數不知道是在數什麼。
 *
 * ⚠️ 回傳值在遷移窗口裡**兩個形態都帶**（票券 44）：`count` 是舊的那一個、會說謊
 * （若干是 1、區間是下限），呼叫端一批一批搬到 `countValue`，票券 50 把它刪掉。
 *
 * 描述那一段**不做正規化**（只去頭尾空白）—— 全形數字只在尾綴那一段打回半形。名字裡的
 * `三年二班３` 不該被系統改寫，而且那會讓往返在描述帶數字時壞掉。
 */
export function parseExtra(
  text: string,
): { description: string; count: number; countValue: CountValue } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const split = splitCount(trimmed);
  const countValue: CountValue = split?.value ?? { kind: "some" };
  const description = (split ? trimmed.slice(0, split.end) : trimmed).trim();
  if (!description) return null;
  return { description, count: countLowerBound(countValue) ?? 1, countValue };
}

/**
 * 一筆群演在畫面與**場次表第一層**上的樣子：`咖啡廳客人（8）`／`（3-5）`／`（10+）`／`（若干）`。
 *
 * **括號不是乘號**（編劇指定，票券 41 第二輪）：印出來的 `x` 只讀得懂整數 —— 一張場次表上的
 * `路人 x3-5` 會被人讀成兩個數字相乘或一段壞掉的字。括號對四種樣子都成立，而且 `parseExtra`
 * 讀得回來（往返是硬約束）。
 *
 * ⚠️ 這條講的是**印出來的樣子**，不是收得進來的樣子：`路人 x3-5` 照樣讀得進來（見
 * `SUFFIX_FORMS`）。顯示改了，輸入不能跟著收窄。
 *
 * 人數一律印出來（包含「若干」）—— 這一欄的形狀就是「描述 ＋ 人數」，藏起來會讓 chip 與
 * 編劇打進去的字對不上，也讓副導少看到一個數字。
 *
 * `countValue` 缺席時（遷移窗口裡手寫的 `ExtraRef`）由舊欄位推出「確切 N」，同 `sceneExtras`。
 */
export function formatExtra(extra: {
  description: string;
  count: number;
  countValue?: CountValue;
}): string {
  const value = extra.countValue ?? legacyCountValue(extra.count);
  return `${extra.description}（${formatCount(value)}）`;
}

/**
 * 場次表第一層的群演欄那一格：多組以頓號相連（`咖啡廳客人（8）、服務生（2）`）。
 *
 * ⚠️ 同一張表上還有另一條括號慣例：`referenceLabel` 的 `實體名（這一場的顯示名）`。兩者
 * **不會讀成同一件事**，因為它們**從不出現在同一欄** —— 那一條只長在人物欄與地點欄（那兩欄
 * 的值是實體引用），群演欄裡的每一格都是「描述（人數）」，而群演沒有實體、沒有顯示名，
 * 生不出 `referenceLabel` 那個形狀。讀者看的是欄，不是單獨一格。
 */
export function extrasLabel(extras: readonly ExtraRef[]): string {
  return extras.map(formatExtra).join("、");
}
