/**
 * 欄位裡那些一個字的記號。
 *
 * 住在自己的檔案，是因為**兩個不同的欄位都要用**（實體欄位與群演欄），而它們刻意不是同一個
 * 元件 —— 讓其中一邊去 import 另一邊的常數，會在兩個平行的欄位之間造出一條假的從屬關係。
 *
 * 記號本身是有意義的區別，不是裝飾：`📍`／`👤` ＝ 命中既有實體、`＋` ＝ 這一輪新建的、
 * `👥` ＝ 群演（**沒有跨場次身分**，見 CONTEXT.md 的「群演」詞條）、`✏️` ＝ **就地改手上
 * 那一筆**，而不是新建一筆：實體欄裡是改實體本身而不是這一場的叫法（票券 39），群演欄裡是
 * 改這一批而不是另外開一批（票券 40）、`↩︎` ＝ 原封不動放回去（什麼都沒改）。
 *
 * ⚠️ `👥` 是**身分**標記（「這東西是群演」），不是動作。所以「原封不動放回手上那一批」那一列
 * 用 `↩︎` 而不是 `👥`：同一份選單裡 `👥` 已經是「把這串字填回輸入框」的補字列（票券 40）。
 */
import type { EntityKind } from "./entity-field";

export const HIT_MARK: Record<EntityKind, string> = { location: "📍", character: "👤" };
export const NEW_MARK = "＋";
export const EXTRA_MARK = "👥";
export const RENAME_MARK = "✏️";
export const PUT_BACK_MARK = "↩︎";
