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
 * ⚠️ **授權主體不只有 `UserId`**（ADR-0011 §②）：票券 12 的 `/s/<token>` 唯讀分享頁沒有帳號，
 * 卻仍要決定能看哪個 project。那是**另一種 authorization subject**（`ShareViewer`），不是
 * 第二套授權機制 —— 它日後鑄造的是同一種 handle 的唯讀變體，寫路徑不接受它。具體型別留到
 * 分享連結實作（階段 8），此刻只保證這裡是它唯一該長出來的地方。
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

export const grantProject = (grant: Omit<AuthorizedProject, typeof authorized>): AuthorizedProject =>
  grant as AuthorizedProject;

export const grantScreenplay = (
  grant: Omit<AuthorizedScreenplay, typeof authorized>,
): AuthorizedScreenplay => grant as AuthorizedScreenplay;
