/**
 * 場次永久識別碼的鑄造與辨識。
 *
 * `sceneId` 是 `sc_` 前綴的 nanoid，**使用者永遠看不到**（ADR-0002）——
 * 只存在於節點的 attr、網址、API 與下游關聯。場次號（顯示序號）是另一回事，
 * 由 `projectScenes()` 在渲染當下推導，不是識別碼。
 *
 * 鑄造只發生在「場次身分被建立」的那五個時刻（規格 §4.3）；本模組只提供鑄造與
 * 辨識的機制，何時呼叫由 command 層決定（票券 03）。
 */
import { nanoid } from "nanoid";

/** `sceneId` 的固定前綴。下游用它一眼區分場次錨點與其他 id（`gr_`、`ch_`、`lo_`…）。 */
export const SCENE_ID_PREFIX = "sc_";

/**
 * 鑄造一個帶前綴的 id。
 *
 * 全專案的 id 是同一個形狀 —— 前綴 ＋ nanoid（`sc_`、`gr_`、`ch_`、`lo_`、`usr_`…），
 * 所以鑄造規則只有一份實作。前綴由呼叫端提供：**前綴屬於那個概念，不屬於這個機制**，
 * 這裡不維護一張會跟不上的前綴清單。
 */
export function mintId(prefix: string): string {
  return `${prefix}${nanoid()}`;
}

/**
 * 鑄造一個新的 `sceneId`。
 *
 * 全域唯一由 nanoid 的碰撞機率保證（21 字元、URL-safe 字母表）。「全域」是實作結果
 * 不是要維護的規則 —— 一份劇本的場次身分只在那份劇本裡有意義（ADR-0002）。
 */
export function mintSceneId(): string {
  return mintId(SCENE_ID_PREFIX);
}

/**
 * 這個值是不是一個形狀正確的 `sceneId`。
 *
 * 只檢查前綴與非空本體，不驗證 nanoid 的字母表 —— 放行外部產生的 id，
 * 嚴格比對留給真正需要的地方。
 */
export function isSceneId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SCENE_ID_PREFIX) && value.length > SCENE_ID_PREFIX.length;
}
