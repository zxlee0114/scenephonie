/**
 * 子場次的推導值（票券 11）—— 純函式，Node 與瀏覽器都能跑，編輯器 decoration 與日後的 PDF
 * 渲染吃同一支（「回到」與「以下對剪」「INS」同一位階：模板產物，不進資料模型，約束 2）。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { sceneAppearingCharacters, sceneLocations } from "./entities";
import { TIME_VALUES, type SceneTime, type SubsceneKind } from "./schema";

/**
 * 這個孩子是不是**主場次自己的內容**。空區塊不算內容（§9.4）—— 不變式 ①（`createSubscene`）
 * 與折返標記用同一個判準，所以只有一個定義點。
 */
export function hasOwnContent(node: ProseMirrorNode): boolean {
  return node.type.name !== "subscene" && node.textContent.trim() !== "";
}

export interface ReturnMarker {
  /** 標記印在主場次第幾個孩子的前面。傳遞值，不被儲存。 */
  readonly blockIndex: number;
  /**
   * 主場次地點的顯示名（雜景多地點以頓號串起）。**不印場次號** —— 場次號在同一頁重複，在台灣
   * 慣例裡很可能被讀成排版錯誤（ADR-0006）。地點還沒填時是 `null`，怎麼印由呼叫端決定。
   */
  readonly location: string | null;
}

/**
 * 折返標記（§9.4、ADR-0006 的推導規則）：
 *
 * | 情況 | 印什麼 |
 * |---|---|
 * | 主場次一段**非空**內容，且之前出現過主場次內容 | 「回到」＋全形空白＋主場次地點 |
 * | 兩個子場次相鄰（中間沒有非空主場次內容） | 不印 |
 *
 * 「本場次第一次出現主場次內容」因不變式 ① 而不可能發生，所以條件簡化為「前面隔著至少一個
 * 子場次」。**空區塊不算內容** —— 編劇雙 Enter 跳出來、卻又改打 `/continue-to` 時，標記從頭到尾
 * 沒有出現過，畫面不會自己閃一下。
 */
export function returnMarkers(scene: ProseMirrorNode): ReturnMarker[] {
  const names = sceneLocations(scene.attrs.location).map((r) => r.displayName);
  const location = names.length > 0 ? names.join("、") : null;

  const out: ReturnMarker[] = [];
  let away = false; // 上一段非空主場次內容之後，是否走進過子場次
  scene.forEach((child, _offset, index) => {
    if (child.type.name === "subscene") {
      away = true;
      return;
    }
    if (!hasOwnContent(child)) return;
    if (away) out.push({ blockIndex: index, location });
    away = false;
  });
  return out;
}

/** 單值 ｜ 陣列 ｜ null 的引用欄 → 排序過的 id 清單（比對用，不在乎欄位裡的順序與顯示名）。 */
const idsOf = <T>(refs: readonly T[], id: (r: T) => string) => refs.map(id).sort().join("\u0000");

/**
 * 不變式 ②：子場次的 metadata 與主場次**完全相同**嗎？相同的話依場次的定義它根本不是另一個
 * 場次 → 視為不完整 → 自動草稿 → 匯出前被攔（草稿的推導在票券 14 接上這一支）。
 *
 * 比的是 §4.3 的四欄 metadata（時間、內外、地點、登場人物）。實體引用比 **id** 不比顯示名：
 * 別名住在引用上（ADR-0005），同一個地點叫「客廳」或「公寓客廳」是同一個時空。
 */
export function subsceneEchoesParent(parent: ProseMirrorNode, subscene: ProseMirrorNode): boolean {
  const a = parent.attrs;
  const b = subscene.attrs;
  return (
    (a.time ?? null) === (b.time ?? null) &&
    (a.intExt ?? null) === (b.intExt ?? null) &&
    idsOf(sceneLocations(a.location), (r) => r.locationId) ===
      idsOf(sceneLocations(b.location), (r) => r.locationId) &&
    idsOf(sceneAppearingCharacters(a.appearingCharacters), (r) => r.characterId) ===
      idsOf(sceneAppearingCharacters(b.appearingCharacters), (r) => r.characterId)
  );
}

/**
 * 子場次時間欄的下拉選單怎麼排（§7.4、ADR-0006 —— `kind` 的 v1 消費者）。
 *
 * | 種類 | 排法 |
 * |---|---|
 * | 接續 | 主場次的值**置頂**並標注「（原場次）」 |
 * | 插入 | 只標注、**不置頂**（閃回的時間常刻意與主場次相反，置頂會推編劇往錯的方向走） |
 *
 * ⚠️ **這不是預填**：欄位仍然是空的，草稿防呆照常運作。地點欄沒有對應的東西 —— 兩種都不置頂，
 * 接續的前提就是地點變了，主場次的地點保證是錯的答案。
 */
export function subsceneTimeOptions(
  kind: SubsceneKind | null,
  parentTime: SceneTime | null,
): { readonly options: readonly SceneTime[]; readonly origin: SceneTime | null } {
  const origin = parentTime && TIME_VALUES.includes(parentTime) ? parentTime : null;
  if (!origin || kind !== "接續") return { options: TIME_VALUES, origin };
  return { options: [origin, ...TIME_VALUES.filter((v) => v !== origin)], origin };
}
