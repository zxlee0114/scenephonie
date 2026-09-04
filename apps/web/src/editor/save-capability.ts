import type { PersistedDoc, SaveResult, SaveToken } from "@/persistence";

/**
 * 「存一份劇本」這個能力的形狀 —— **編輯器手上那個函式**。
 *
 * client 端拿到的是這個型別的一個函式（由 page 從 server action 注入），不是 persistence
 * 本身 —— 編輯器不認識路由層，路由層也不被編輯器 import（§6.3 edge boundary）。
 *
 * 它住在編輯器這邊而不是 persistence 裡，是因為下面的 `forbidden` 是**授權**的詞：
 * persistence 看不到授權，也不該看到（不變式 H）。這個檔案沒有任何執行期相依，
 * 編輯器、server action、page 三邊都 import 得起。
 */

/**
 * client 手上有的東西：一個 `screenplayId` 字串與上次拿到的 token。
 *
 * ⚠️ **它不是已授權的 handle** —— 它從瀏覽器來，任何字串都可能出現在這裡。route handler
 * 的第一件事就是拿它去過 gate；換到 handle 之後才進得了 persistence（不變式 H）。
 */
export type SaveScreenplayRequest = {
  screenplayId: string;
  doc: PersistedDoc;
  token: SaveToken;
};

/**
 * 存檔的結果。
 *
 * `forbidden` 是 route handler 那一層加上去的，persistence 自己只會回 `saved`／`conflict`。
 * 編輯器必須分得出這兩種失敗：`conflict` 是「別處改過了」，`forbidden` 是「你已經不是這份稿
 * 的主人（或 session 過期了）」，處置方式不同。
 */
export type SaveOutcome = SaveResult | { status: "forbidden" };

export type SaveScreenplay = (request: SaveScreenplayRequest) => Promise<SaveOutcome>;
