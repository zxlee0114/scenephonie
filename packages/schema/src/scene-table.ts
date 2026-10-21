/**
 * 場次表（票券 15，§8）—— **第一層投影：純從劇本推導，零新增資訊。**
 *
 * 兩段，各自只做一件事：
 *
 * | 函式 | 輸入 | 決定 |
 * |---|---|---|
 * | `projectSceneTable(doc)` | **只有 doc** | 哪些列、什麼順序、每一列的原始值 |
 * | `labelSceneTable(table, names)` | 投影 ＋ 實體名 | 格子裡印什麼字；`missingRefs` |
 *
 * ⚠️ **`projectSceneTable` 的簽名裡沒有 doc 以外的輸入**（§6.4、ADR-0007）—— 型別本身在強制
 * 「零新增資訊」：有人想加一欄製作端另填的東西，會發現簽名裝不下。實體名**不在 doc 裡**（實體
 * 住在專案的表，ADR-0005），所以「`實體名（顯示名）`」那一步拆成第二段：它只多吃一份 id → 名字
 * 的查表，加不出新的欄，而懸空引用（`missingRefs`）也只有看得到實體表的那一段判斷得了
 * （使用者裁決 2026-10-21，票券 15）。
 *
 * **不建投影表**：讀取當下純函式推導。日後要加就是這個函式輸出的快取，key 是 doc 的並行
 * token（persistence 的內部欄位，§6.4），可 `DROP` 重建。**場次表沒有自己的寫入路徑** —— 要改就回頭改 doc、走 command 層。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { referenceLabel, sceneAppearingCharacters, sceneLocations } from "./entities";
import { extrasLabel, sceneExtras } from "./extras";
import { sceneEntries, type SceneNumber } from "./project-scenes";
import { MONTAGE, type CharacterRef, type ExtraRef, type LocationRef, type SceneIntExt, type SceneTime } from "./schema";

/**
 * 雜景留空地點時印的**推導文字**（§4.3、§8）。不是一筆實體 —— 不建垃圾實體，地點在敘述裡。
 * 雜景是刻意接受的資訊密度損失：不拆成多列。
 */
const MONTAGE_UNSPECIFIED_LOCATION = "參照敘述";

/** 場次表的一列 —— 一個正式場次（主場次、子場次或群組成員）的原始值，還沒接上實體名。 */
export interface SceneTableRow {
  /** 永久 id。列點擊跳回編輯器掛在這裡（重排場次也不跳錯），不掛 `label`。 */
  sceneId: string;
  /** 場次號：`12`／`5.1`／`26`。草稿不進表，所以這裡永遠是正式號。 */
  label: string;
  /**
   * 子場次的主場次（或成員）—— 只為了**縮排**（視覺次級）。子場次在表上自佔一列、緊接主場次
   * 之後，可以被排序、被篩選；它的 `種類` 不進表（消費者在第三層，§8）。主場次為 `undefined`。
   */
  parentSceneId?: string;
  /** 景（內外）。正式場次一定有值 —— 空著就是草稿，不會走到這裡。 */
  intExt: SceneIntExt;
  /** 光（時間）。同上。 */
  time: SceneTime;
  /** 地點引用。單值；雜景可多個或留空。 */
  locations: LocationRef[];
  appearingCharacters: CharacterRef[];
  extras: ExtraRef[];
}

export interface SceneTable {
  rows: SceneTableRow[];
}

/**
 * 場次表那一張表：依文件順序，每個**正式**場次一列。走的是 `projectScenes` 的同一次走訪
 * （場次號、草稿判定、群組成員展開，§6.4）—— PDF 與匯出前清單也從那裡取，不會長出兩套。
 *
 * @param doc 已 hydrate 的 ProseMirror doc 節點。
 */
export function projectSceneTable(doc: ProseMirrorNode): SceneTable {
  return {
    rows: sceneEntries(doc)
      // 草稿不進表（§4.8）—— 主場次是草稿時子場次已在走訪裡連帶成草稿。
      .filter(({ scene }) => !scene.draft)
      .map(({ scene, node }) => row(scene, node)),
  };
}

function row(scene: SceneNumber, node: ProseMirrorNode): SceneTableRow {
  return {
    sceneId: scene.sceneId,
    label: scene.label,
    ...(scene.parentSceneId ? { parentSceneId: scene.parentSceneId } : {}),
    intExt: node.attrs.intExt as SceneIntExt,
    time: node.attrs.time as SceneTime,
    locations: sceneLocations(node.attrs.location),
    appearingCharacters: sceneAppearingCharacters(node.attrs.appearingCharacters),
    extras: sceneExtras(node.attrs.extras),
  };
}

/**
 * 實體 id → 實體名（專案的 `characters`／`locations` 表）。**只有名字** —— 這一段能多吃的就這麼多，
 * 加不出一欄製作端另填的東西。
 */
export interface SceneTableNames {
  characters: ReadonlyMap<string, string>;
  locations: ReadonlyMap<string, string>;
}

/** 場次表印出來的一列：六欄都是字。 */
export interface LabeledSceneTableRow
  extends Omit<SceneTableRow, "locations" | "appearingCharacters" | "extras"> {
  location: string;
  appearingCharacters: string;
  extras: string;
}

/**
 * 一筆指向不存在實體的引用（實體被 ⌘Z 掉、跨劇本貼上、資料庫還原）。
 *
 * ⚠️ **`missingRefs` 是 projection 的診斷輸出，不是業務輸出**（§6.6）：不參與渲染、不被持久化、
 * 消費者的業務邏輯不得讀它。顯示名照印、沒有任何東西被少印 —— 對編劇沒有可行動的資訊，跳警告
 * 只是假警報。它的讀者是我們（§6.6 要的伺服器端結構化日誌 —— 還沒接，票券 15 只在 client
 * 推導場次表，那裡刻意丟掉它），不是編劇。
 */
export interface MissingRef {
  sceneId: string;
  kind: "character" | "location";
  id: string;
  displayName: string;
}

export interface LabeledSceneTable {
  rows: LabeledSceneTableRow[];
  /** 診斷用，見 `MissingRef`。 */
  missingRefs: MissingRef[];
}

/**
 * 把實體名接上投影，印成格子裡的字（§8）。地點欄與登場人物欄印 `實體名（這一場的顯示名）`，
 * **只在兩者不同時才印括號**（`referenceLabel`）。
 *
 * **讀取容忍**（§6.6）：懸空引用照印顯示名 —— 顯示名是渲染權威。少的只是一條可聚合的連結，
 * 那一筆記進 `missingRefs`。⚠️ 別在這裡擋掉它：那會讓表上少印一個地點。
 */
export function labelSceneTable(table: SceneTable, names: SceneTableNames): LabeledSceneTable {
  const missingRefs: MissingRef[] = [];
  /** 一個引用的那一格文字；查不到實體就記一筆、照印顯示名。 */
  const cell = (sceneId: string, kind: MissingRef["kind"], id: string, displayName: string) => {
    const name = (kind === "location" ? names.locations : names.characters).get(id);
    if (name === undefined) missingRefs.push({ sceneId, kind, id, displayName });
    return referenceLabel(displayName, name);
  };

  const rows = table.rows.map(({ locations, appearingCharacters, extras, ...rest }) => ({
    ...rest,
    location:
      locations.length === 0 && rest.intExt === MONTAGE
        ? MONTAGE_UNSPECIFIED_LOCATION
        : locations.map((r) => cell(rest.sceneId, "location", r.locationId, r.displayName)).join("、"),
    appearingCharacters: appearingCharacters
      .map((r) => cell(rest.sceneId, "character", r.characterId, r.displayName))
      .join("、"),
    extras: extrasLabel(extras),
  }));
  return { rows, missingRefs };
}
