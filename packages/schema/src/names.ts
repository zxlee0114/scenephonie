/**
 * 多值欄位的輸入規則（§4.7）—— **同時適用地點欄與登場人物欄**，貼上走同一份解析。
 *
 * > **標點（`、` `，` `,` `；` `;`）是分隔符；全形半形空白一律視為名字的一部分。**
 *
 * 空白全排除不是美感問題：中文列舉本來就用頓號，而**注音的空白鍵是選字鍵、Enter 是送出鍵**，
 * 兩者在組字期間都被 IME 吃掉 —— 把分隔綁在那種鍵上正是票券 03 那個 bug 家族。
 *
 * 這一份是純函式且不含任何 DOM，所以「貼上的字串怎麼切」在伺服器端（日後的匯入）與編輯器裡
 * 是同一個答案。
 */

/** 分隔符。清單就是規格 §4.7 那一行，不多不少。 */
export const NAME_SEPARATORS = ["、", "，", ",", "；", ";"] as const;

/** 由上面那份清單推導 —— 兩處各寫一次的話，改一處就會靜靜地與規格不一致。 */
const SEPARATOR = new RegExp(`[${NAME_SEPARATORS.join("")}]`);

/**
 * 名字**內部**的空白是內容（`海豚 公寓房間` 是一個名字），但兩端的空白不是名字的一部分
 * （`小明 、小華` 打出來的是「小明」）—— 分隔規則管的是「空白不切開名字」，不是「空白也算字」。
 * `String.trim()` 連全形空白 U+3000 一起處理，所以兩種空白同一條規則。
 */
const clean = (segment: string): string => segment.trim();

/** 把一段文字切成名字（空白段落丟掉，不產生空 chip）。 */
export function splitNames(text: string): string[] {
  return text
    .split(SEPARATOR)
    .map(clean)
    .filter((name) => name.length > 0);
}

/**
 * 即時切 chip 用的解析：**分隔符之前的都定案，最後一段還在打**。
 *
 * 地點是實體，編劇必須立刻看到是命中既有實體還是新建 —— 所以 chip 化發生在打下分隔符的當下，
 * 不等離開欄位。`rest` 原封不動留在 input 裡（**刻意不 trim**：還在打的字，尾端空白可能是
 * 下一個字的一部分）。
 */
export function splitNamesLive(text: string): { names: string[]; rest: string } {
  const segments = text.split(SEPARATOR);
  const rest = segments.pop() ?? "";
  return { names: segments.map(clean).filter((name) => name.length > 0), rest };
}

/** 這段文字裡有分隔符嗎（貼上時決定要不要走多值解析）。 */
export function hasSeparator(text: string): boolean {
  return SEPARATOR.test(text);
}
