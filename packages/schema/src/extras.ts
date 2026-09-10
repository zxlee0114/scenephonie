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
 * 人數不是正整數時**不丟掉這一筆**，補成 1：描述才是那一筆的內容，人數壞掉只是少一個數字。
 * 沒有 `extraId` 的才丟 —— 那一筆沒有身分，對白的人物欄指不到它，留著也沒有人用得上。
 */
export function sceneExtras(value: unknown): ExtraRef[] {
  if (!Array.isArray(value)) return [];
  const out: ExtraRef[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const { extraId, description, count } = raw as Record<string, unknown>;
    if (!isExtraId(extraId) || typeof description !== "string") continue;
    out.push({
      extraId,
      description,
      count: Number.isInteger(count) && (count as number) >= 1 ? (count as number) : 1,
    });
  }
  return out;
}

/** 全形數字（`１２３`）打回半形 —— 注音鍵盤下的數字常常是全形，那不該變成另一種寫法。 */
const halfWidthDigits = (text: string): string =>
  text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));

/**
 * 人數的尾綴：`x8`／`X8`／`×8`／`＊8`／`*8`，前面可以有空白。
 *
 * 只認**結尾**的那一段。`x` 出現在描述中間（`x 光室的病人`）不是人數 —— 那是名字的一部分，
 * 同「全形半形空白一律視為名字的一部分」那條規則的精神。
 */
const COUNT_SUFFIX = /[\s\u3000]*[xX×＊*][\s\u3000]*(\d+)$/;

/**
 * 把編劇打的一段字解析成一筆群演：**`描述 x 人數`**（`咖啡廳客人 x8`）。
 *
 * 沒寫人數就是 **1**（`服務生` ＝ 一位服務生）—— 不留「未填」這個狀態：`count` 不允許 null，
 * 而「一位」是這串字最誠實的讀法，比逼編劇每次都打 `x1` 好。
 *
 * `x0` 不算人數（0 個背景演員等於沒有這一筆），整串字退回去當描述 —— 系統不替編劇決定他
 * 打的 `x0` 是筆誤還是名字。
 *
 * 描述空白（只打了 `x8`）回 `null`：沒有描述的人數不知道是在數什麼。
 */
export function parseExtra(text: string): { description: string; count: number } | null {
  const normalized = halfWidthDigits(text).trim();
  if (!normalized) return null;

  const match = COUNT_SUFFIX.exec(normalized);
  const count = match ? Number(match[1]) : 0;
  if (!match || count < 1) {
    return { description: normalized, count: 1 };
  }
  const description = normalized.slice(0, match.index).trim();
  if (!description) return null;
  return { description, count };
}

/**
 * 一筆群演在畫面與**場次表第一層**上的樣子：`咖啡廳客人 x8`。
 *
 * 人數一律印出來（包含 `x1`）—— 這一欄的形狀就是「描述 ＋ 人數」，藏起來會讓 chip 與編劇
 * 打進去的字對不上，也讓副導少看到一個數字。
 */
export function formatExtra(extra: { description: string; count: number }): string {
  return `${extra.description} x${extra.count}`;
}

/** 場次表第一層的群演欄那一格：多組以頓號相連（`咖啡廳客人 x8、服務生 x2`）。 */
export function extrasLabel(extras: readonly ExtraRef[]): string {
  return extras.map(formatExtra).join("、");
}
