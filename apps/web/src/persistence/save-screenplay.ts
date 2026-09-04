import type { SaveRequest, SaveResult } from "./screenplay-store";

/**
 * 「存一份劇本」這個能力的形狀。
 *
 * client 端拿到的是這個型別的一個函式（由 page 從 server action 注入），不是 persistence
 * 本身 —— 編輯器不該認識路由層，路由層也不該被編輯器 import（§6.3 edge boundary）。
 * 這個檔案沒有任何執行期相依，兩邊都 import 得起。
 */
export type SaveScreenplay = (request: SaveRequest) => Promise<SaveResult>;
