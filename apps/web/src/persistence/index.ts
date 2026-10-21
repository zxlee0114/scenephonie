/**
 * persistence —— 存／載一份劇本，全部藏在這個模組後面。
 *
 * ⚠️ 這裡是**伺服器端**的表面（會拉進 drizzle／postgres）。client 端要的節奏控制在
 * `./save-scheduler`，那個檔案沒有資料庫相依，單獨 import。
 *
 * 模組外看得到的名詞只有：載入、存檔、一個不透明的 token，與**交付**（建立一筆、讀回一筆）。
 * **沒有備份、沒有 `doc_seq`、沒有 schema 遷移** —— 那些是這個模組怎麼守住承諾的內部手段（§6.7）。
 * 交付與備份是兩條分開的寫入路徑（§10.4），只是同住在這裡：讀出 canonical doc 只准在這個模組。
 */
export { createScreenplay, loadScreenplay, saveScreenplay } from "./screenplay-store";
export type { LoadedScreenplay, SaveRequest, SaveResult } from "./screenplay-store";
export type { SaveToken } from "./save-token";
export type { PersistedDoc } from "./doc-schema-version";
// `loadDelivery` 此刻還沒有產品呼叫端 —— 它是票 17 本身要的「重試＝用同一筆交付重跑」那個入口，
// 渲染器（票券 18）與凍結分享（票券 20）都從這裡讀，不讀 live doc。
export { createDelivery, loadDelivery } from "./delivery-store";
export type { Delivery } from "./delivery-store";
