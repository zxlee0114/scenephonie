/**
 * 自動備份的觸發判定（§6.7）。
 *
 * 風險是有牙齒的：⌘Z 只活在瀏覽器分頁裡，分頁一關就沒了 —— 編劇失去的不是一個功能，
 * 是三個月的稿。備份寫的是 **before-image**（被這次存檔覆蓋掉的那一份 doc，成本幾乎為零，
 * 它本來就在手上）。**它是 recovery 機制，不是版本歷史功能**：無查閱 UI、v1 全部保留。
 *
 * **判定是伺服器端的純時間判定，不由 client 宣告** —— client 會開兩個分頁、會離線、會當掉；
 * 更糟的是分頁不關，擺著三天就是「一個階段」。判定只看備份表的 `MAX(created_at)`。
 *
 * 規格 §6.7 另提到一條實作層 heuristic（「距上次成功存檔 ≥ 30 分鐘就視為新的一次坐下」）。
 * 這裡**不實作**它：它只會讓備份變多、絕不會變少，所以不影響下面這條硬保證；而票券把觸發
 * 收斂成「只看備份表 `MAX(created_at)`」的單一判準，多一個輸入就多一種要解釋的行為。
 */

/** 硬保證的間隔。對外可講的承諾：「任何時候最多只會退回兩小時。」 */
export const BACKUP_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * 這次存檔要不要先寫一筆備份。
 *
 * 從來沒備份過就是要 —— 承諾「最多退回兩小時」在第一次存檔當下就已經生效。
 */
export function needsBackup({
  lastBackupAt,
  now,
}: {
  lastBackupAt: Date | null;
  now: Date;
}): boolean {
  if (!lastBackupAt) return true;
  return now.getTime() - lastBackupAt.getTime() >= BACKUP_INTERVAL_MS;
}
