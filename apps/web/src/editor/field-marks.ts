/**
 * 欄位裡那些一個字的記號。
 *
 * 住在自己的檔案，是因為**兩個不同的欄位都要用**（實體欄位與群演欄），而它們刻意不是同一個
 * 元件 —— 讓其中一邊去 import 另一邊的常數，會在兩個平行的欄位之間造出一條假的從屬關係。
 *
 * 記號本身是有意義的區別，不是裝飾：`📍`／`👤` ＝ 命中既有實體、`＋` ＝ 這一輪新建的、
 * `👥` ＝ 群演（**沒有跨場次身分**，見 CONTEXT.md 的「群演」詞條）、`✏️` ＝ 改的是實體本身
 * 而不是這一場的叫法（票券 39）。
 */
import type { EntityKind } from "./entity-field";

export const HIT_MARK: Record<EntityKind, string> = { location: "📍", character: "👤" };
export const NEW_MARK = "＋";
export const EXTRA_MARK = "👥";
export const RENAME_MARK = "✏️";
