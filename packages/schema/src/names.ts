/**
 * 多值欄位的輸入規則（§4.7）—— **地點欄、登場人物欄、對白人物欄與群演欄同一份**，貼上走同一份解析。
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
 * Enter（或離開欄位）那一下的解析：**分隔符之前的各段是名字，最後一段交給選單**（票券 82）。
 *
 * 打字過程中分隔符只是字 —— 不切 chip、不建實體，要等 Enter 才整串一次解析。即時切會讓同一串
 * 名字分成兩種待遇（「小八、吉伊」打到頓號時小八已經悄悄建好，吉伊還要等 Enter），而「立刻
 * 看到命中還是新建」對注音使用者本來就不成立：組字中 Enter 屬於 IME，字送出之前這一欄什麼都
 * 還沒發生。所以結果仍在 Enter 那一下當場看得到。
 *
 * 選單（以及組字中的唯讀預覽）只看 `last` —— 最後一個分隔符之後正在打的那段。`last`
 * **刻意不 trim**：還在打的字，尾端空白可能是下一個字的一部分。
 */
export function parseNameDraft(text: string): { names: string[]; last: string } {
  const segments = text.split(SEPARATOR);
  const last = segments.pop() ?? "";
  return { names: segments.map(clean).filter((name) => name.length > 0), last };
}

/**
 * 分隔符**以外**的台詞標點（票券 82）。清單就是票上那一行，不多不少。
 *
 * 對白人物欄裡出現它們，那串字多半是台詞而不是人名（「你不說話，我就當你答應了。」）——
 * 選單第一列換成「↓ 移到台詞」。`，` 不在這裡：它是分隔符，「阿盈，建鳴」在三欄都是兩個人。
 */
export const DIALOGUE_MARKS = ["。", "？", "！", "…", "—", "「", "」", "："] as const;

const DIALOGUE_MARK = new RegExp(`[${DIALOGUE_MARKS.join("")}]`);

/** 這段文字裡有台詞標點嗎。 */
export function hasDialogueMark(text: string): boolean {
  return DIALOGUE_MARK.test(text);
}

/** 這段文字裡有分隔符嗎（貼上時決定要不要走多值解析）。 */
export function hasSeparator(text: string): boolean {
  return SEPARATOR.test(text);
}
