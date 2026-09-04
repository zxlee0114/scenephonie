import { describe, expect, it } from "vitest";

import { BACKUP_INTERVAL_MS, needsBackup } from "./backup-policy";

/**
 * 硬保證（規格層級）：距這份劇本的上一筆自動備份 ≥ 2 小時時，該次存檔先寫一筆備份。
 * 對外可講的承諾 ——「任何時候最多只會退回兩小時。」
 */
describe("自動備份的觸發判定", () => {
  const now = new Date("2026-09-04T12:00:00Z");

  it("從來沒備份過就先寫一筆 —— 承諾在第一次存檔當下就生效", () => {
    expect(needsBackup({ lastBackupAt: null, now })).toBe(true);
  });

  it("距上一筆備份未滿兩小時：不寫", () => {
    const lastBackupAt = new Date(now.getTime() - BACKUP_INTERVAL_MS + 1);
    expect(needsBackup({ lastBackupAt, now })).toBe(false);
  });

  it("距上一筆備份剛好兩小時：寫（邊界含在承諾內）", () => {
    const lastBackupAt = new Date(now.getTime() - BACKUP_INTERVAL_MS);
    expect(needsBackup({ lastBackupAt, now })).toBe(true);
  });

  it("承諾的間隔就是兩小時", () => {
    expect(BACKUP_INTERVAL_MS).toBe(2 * 60 * 60 * 1000);
  });
});
