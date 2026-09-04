/**
 * 誰能登入 —— Google OAuth 的 registration/access policy（票券 24 §7）。
 *
 * **是 env var 逗號清單，不是 `invitations` 表。** 理由是產品邊界不是儲存成本：v1 的使用者
 * 就是作者本人與明確邀請的編劇朋友。建表等於在 v1 就把 members／invitations 的形狀猜出來，
 * 而那要留給未來演進 —— **env var 是一個看得出來是暫時物的東西，不會假裝自己是領域模型**
 * （建了表，它就會開始長欄位）。
 *
 * ⚠️ **沒設或設空就是誰都不准進**（fail closed）。少一個環境變數的後果是「沒人登得進來」，
 * 不是「所有人都登得進來」—— 這兩種失敗的代價不對稱。
 *
 * 這個檔案沒有任何相依（不碰 DB、不碰 auth library），所以它是純函式、可單元測試。
 */

/** 清單的環境變數名。 */
export const ALLOWLIST_ENV = "AUTH_ALLOWED_EMAILS";

/** 逗號分隔 → 正規化過的 email 集合。空白與空項目一律丟掉。 */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.length > 0);
}

/**
 * 這個 email 在清單裡嗎。
 *
 * 比對前先正規化：Google 回來的 email 大小寫不保證與作者當初打進 env var 的一致，
 * 而「大小寫不同就登不進去」會是一個查半天的假 bug。
 */
export function isAllowedEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parseAllowlist(raw).includes(normalizeEmail(email));
}

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
