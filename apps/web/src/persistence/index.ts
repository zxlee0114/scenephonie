/**
 * persistence —— 存／載一份劇本，全部藏在這個模組後面。
 *
 * ⚠️ 這裡是**伺服器端**的表面（會拉進 drizzle／postgres）。client 端要的節奏控制在
 * `./save-scheduler`，那個檔案沒有資料庫相依，單獨 import。
 *
 * 模組外看得到的名詞只有：載入、存檔、一個不透明的 token。**沒有備份、沒有 `doc_seq`、
 * 沒有 schema 遷移** —— 那些是這個模組怎麼守住承諾的內部手段（§6.7）。
 */
export { createScreenplay, loadScreenplay, saveScreenplay } from "./screenplay-store";
export type { LoadedScreenplay, SaveRequest, SaveResult } from "./screenplay-store";
export type { SaveScreenplay, SaveScreenplayRequest, SaveOutcome } from "./save-screenplay";
export type { SaveToken } from "./save-token";
export type { PersistedDoc } from "./doc-schema-version";
