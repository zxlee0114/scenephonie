/**
 * 已授權的 handle —— 不變式 H 的型別形狀。
 *
 * > Authentication identity 不直接授予 domain authority；domain write operations 必須以
 * > **已授權的 project context** 進入 command pipeline（command 不負責建立 authorization）。
 *
 * 具體作法：write use case **只吃 handle、不吃 `userId`**。於是「沒授權就呼叫」不是
 * 「每個 handler 記得檢查」，而是**在型別上表示不出來** —— 與票券 09 否決 `depth` 旗標、
 * 票券 17 否決指標是同一招：靠慣例維持的東西會說謊。
 *
 * handle 只能由 `./gate` 鑄造（`grantProject`／`grantScreenplay` 沒有從 `./index` 出去），
 * 因為 brand 是 `unique symbol`，模組外湊不出這個型別。
 *
 * ⚠️ **授權主體不只有 `UserId`**（ADR-0011 §②）：`/s/<token>` 唯讀分享頁沒有帳號，卻仍要決定
 * 能看哪份劇本。那是**另一種 authorization subject**（`ShareViewer`，票券 20），不是第二套授權
 * 機制 —— 同一個 gate、同一種 brand，只是 brand 的值不同（`"share"`），所以它結構上塞不進任何
 * 要 `AuthorizedScreenplay` 的地方：**寫路徑不接受它**是型別說的，不是 handler 記得的。
 */

declare const authorized: unique symbol;

/** 「這個人可以操作這個 project」的證據。 */
export type AuthorizedProject = {
  readonly projectId: string;
  readonly ownerId: string;
  readonly [authorized]: "project";
};

/**
 * 「這個人可以操作這份劇本」的證據。帶著 `projectId` —— 授權是從專案來的，
 * 劇本自己不是授權主體（`screenplays.project_id → projects.owner_id` 是唯一那條路）。
 */
export type AuthorizedScreenplay = {
  readonly screenplayId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly [authorized]: "screenplay";
};

/**
 * 「這個人可以還原這個**已刪除**的專案」的證據（票券 72）。
 *
 * 已刪除的專案過不了 `authorizeProjectForUser` —— 打不開、存不了、分享連結全部停用。可是「還原」總得
 * 有一個入口，這就是它：**只有還原收它**。它是另一種 brand（`"deleted-project"`），所以結構上塞不進
 * 任何要 `AuthorizedProject` 的地方 —— 已刪除的專案不會因為拿得到這個 handle 就被讀、被寫。
 * `AuthorizedProject` 也因此不多出「可能已刪除」這種狀態。
 */
export type DeletedProject = {
  readonly projectId: string;
  readonly ownerId: string;
  readonly [authorized]: "deleted-project";
};

/**
 * 「拿著這條分享連結的人可以讀這份劇本（的這一個投影）」的證據（票券 20）。
 *
 * 唯讀：只有讀取分享內容的那一支（persistence 的 `loadSharedScript`）收它。`deliveryId` 為 `null`
 * ＝ 即時分享（讀 live doc 的投影）；有值 ＝ 凍結分享，只讀那筆交付，永遠不碰 live doc。
 *
 * 沒有 `ownerId`：訪客不是任何人，這個 handle 也不該攜帶「這是誰的」。
 */
export type ShareViewer = {
  readonly shareId: string;
  readonly screenplayId: string;
  readonly projectId: string;
  readonly deliveryId: string | null;
  readonly [authorized]: "share";
};

export const grantProject = (grant: Omit<AuthorizedProject, typeof authorized>): AuthorizedProject =>
  grant as AuthorizedProject;

export const grantScreenplay = (
  grant: Omit<AuthorizedScreenplay, typeof authorized>,
): AuthorizedScreenplay => grant as AuthorizedScreenplay;

export const grantShareViewer = (grant: Omit<ShareViewer, typeof authorized>): ShareViewer => grant as ShareViewer;

export const grantDeletedProject = (grant: Omit<DeletedProject, typeof authorized>): DeletedProject =>
  grant as DeletedProject;
