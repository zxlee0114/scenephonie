/**
 * 人物與地點實體的 isomorphic 那一半（§4.7、[ADR-0005](../../../docs/adr/0005-entities-exist-by-reference.md)）。
 *
 * 這裡**沒有實體表** —— 實體表住在 `apps/web`（Postgres），因為它跨場次、doc 裝不下。
 * kernel 這一側只要三樣東西：id 的形狀、command 用來問「這筆實體在嗎」的**目錄**介面、
 * 以及讀取路徑用的正規化與標籤推導。
 *
 * ── 存在 ＝ 被引用 ────────────────────────────────────────────────────
 * 一筆實體「存在」是**至少有一個引用指向它**，不是它在表裡有一列。所以：
 *   - 「刪除實體」這個動作不存在（編劇只能拿掉引用）；
 *   - ⌘Z 掉的實體變孤兒，孤兒不出現在任何地方、v1 永不清理；
 *   - 於是 doc 的 undo 堆疊與實體表**不需要**一致 —— 問題消失而非被解決。
 *
 * ── 引用完整性（不變式 ⑧）：寫入嚴格、讀取容忍，兩半必須並排 ─────────────
 * **寫入**（`commands/entity-refs.ts`）：拒絕建立對不存在實體的引用，且**先建立實體、再寫入 doc**
 * —— 後者不是建議順序，是前者能成立的前提（檢查對象是實體表，反過來的話每一次建立新人物的
 * command 都會被自己的不變式擋下）。
 * **讀取**（本檔的 `sceneLocations`／`referenceLabel`）：**允許懸空引用**。顯示名是渲染權威，
 * PDF 與場次表照印，只是少一條可聚合的連結。
 *
 * ⚠️ 想「修」任一半之前先讀另一半：在 projection 擋掉懸空引用會讓 PDF 少印一個地點
 * （投獎者最糟的失敗模式）；讓 command 放行以求彈性會讓 doc 累積髒引用。
 */
import { mintId } from "./ids";
import type { CharacterRef, DialogueCharacterRef, LocationRef } from "./schema";

/** 人物 id 的前綴。使用者永遠看不到（同 `sc_`）。 */
export const CHARACTER_ID_PREFIX = "ch_";
/** 地點 id 的前綴。 */
export const LOCATION_ID_PREFIX = "lo_";

export function mintCharacterId(): string {
  return mintId(CHARACTER_ID_PREFIX);
}

export function mintLocationId(): string {
  return mintId(LOCATION_ID_PREFIX);
}

const hasPrefix = (value: unknown, prefix: string): value is string =>
  typeof value === "string" && value.startsWith(prefix) && value.length > prefix.length;

export function isCharacterId(value: unknown): value is string {
  return hasPrefix(value, CHARACTER_ID_PREFIX);
}

export function isLocationId(value: unknown): value is string {
  return hasPrefix(value, LOCATION_ID_PREFIX);
}

/**
 * 「這筆實體在嗎」的**唯一提問方式**。
 *
 * command 是純函式（吃 doc 吐 doc），不能自己去查資料庫 —— 所以存在性由呼叫端以這個介面
 * 注入。伺服器端傳的是一次查詢的結果，編輯器傳的是它手上那份專案目錄；兩邊問的是同一句話。
 */
export interface EntityDirectory {
  hasCharacter(id: string): boolean;
  hasLocation(id: string): boolean;
}

/** 用兩組 id 造一份目錄（伺服器查詢結果、編輯器的本地目錄、測試都用這個）。 */
export function entityDirectory(ids: {
  readonly characterIds?: Iterable<string>;
  readonly locationIds?: Iterable<string>;
}): EntityDirectory {
  const characters = new Set(ids.characterIds ?? []);
  const locations = new Set(ids.locationIds ?? []);
  return {
    hasCharacter: (id) => characters.has(id),
    hasLocation: (id) => locations.has(id),
  };
}

function isRef(value: unknown): value is { displayName: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { displayName?: unknown }).displayName === "string"
  );
}

/**
 * 場次 `location` attr 的讀取正規化。
 *
 * attr 的形狀是**單值 ｜ 陣列（僅雜景）｜ null**（§4.3）—— metadata 一律單值，雜景是場次定義
 * 唯一的逃生口。讀的人不該每次都重寫這個分支，所以正規化只有這一份。
 *
 * **容忍壞形狀**：讀取路徑寧可少讀一筆，也不能因為一個歪掉的 attr 就讓整份稿印不出來（§6.6）。
 */
export function sceneLocations(value: unknown): LocationRef[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return raw.filter(isRef) as LocationRef[];
}

/** 場次 `appearingCharacters` attr 的讀取正規化（同上；它本來就是陣列，但一樣容忍壞形狀）。 */
export function sceneAppearingCharacters(value: unknown): CharacterRef[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return raw.filter(isRef) as CharacterRef[];
}

/**
 * 對白 `character` attr 的讀取正規化。
 *
 * 形狀與場次的地點欄同一套：**單值 ｜ 陣列 ｜ null**。多值是因為**多個具名角色可以同時說
 * 一句台詞**（齊聲），不是因為這一欄鬆散 —— 舊稿裡的單值物件照樣讀得出來，不必遷移。
 */
export function dialogueCharacters(value: unknown): DialogueCharacterRef[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return raw.filter(isRef) as DialogueCharacterRef[];
}

/**
 * 場次表地點欄／登場人物欄的一格文字（§10.2）：**`實體名（這一場的顯示名）`，只在兩者不同時
 * 才印括號**。
 *
 * 括號裡放的是**這一場的**顯示名而非所有別名 —— 場次表的一列是一個場次，製片是拿它對照 PDF
 * 看的，列出別場的叫法反而對不上。
 *
 * `entityName` 為 `undefined`／`null` ＝ **懸空引用**（實體被 ⌘Z 掉、跨劇本貼上）。那時照印
 * 顯示名、不加括號、不跳警告 —— 少的只是一條可聚合的連結，不是少一個地點（§6.6 讀取那一半）。
 */
export function referenceLabel(displayName: string, entityName?: string | null): string {
  if (!entityName || entityName === displayName) return displayName;
  return `${entityName}（${displayName}）`;
}
