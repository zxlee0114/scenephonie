import type { ProjectSummary } from "./project-store";

/**
 * 刪除的專案留多久（票券 72）：30 天內可以從「已刪除」還原，過了由每日排程永久刪除。
 *
 * 這裡是純函式 —— 儀表板與排程看的是同一個期限，兩邊不各寫一份。
 */
export const PROJECT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 這個時刻（含）以前刪的專案，排程可以永久刪除了。 */
export const projectPurgeCutoff = (now: Date): Date => new Date(now.getTime() - PROJECT_RETENTION_DAYS * DAY_MS);

/**
 * 已刪除卡片上那一行：「還剩 N 天」或「今天到期」。
 *
 * **無條件進位**：排程一天只跑一次，實際消失落在第 30～31 天之間 —— 顯示的數字只能比實際保守，
 * 不能發生「寫著還剩 1 天，點進去已經不見」。不到一天（含已經過期、排程還沒跑到的）一律「今天到期」。
 */
export function purgeCountdown(deletedAt: Date, now: Date): string {
  const remaining = deletedAt.getTime() + PROJECT_RETENTION_DAYS * DAY_MS - now.getTime();
  if (remaining < DAY_MS) return "今天到期";
  return `還剩 ${Math.ceil(remaining / DAY_MS)} 天`;
}

export type DashboardShelves = {
  /** 主區：沒封存也沒刪的，最近編輯在前。 */
  active: ProjectSummary[];
  /** 已封存（沒刪的），最近編輯在前。 */
  archived: ProjectSummary[];
  /** 已刪除（不管有沒有封存），最快到期的在前 —— 這一區只回答「哪個快要救不回來了」。 */
  deleted: ProjectSummary[];
};

/**
 * 把卡片分到儀表板的三區。進來的順序就是主區與已封存的順序（`ownedProjects` 已經是最近編輯在前）。
 *
 * 刪除蓋過封存：已封存又已刪除的在「已刪除」，還原之後才回到「已封存」。
 */
export function dashboardShelves(cards: ProjectSummary[]): DashboardShelves {
  return {
    active: cards.filter((card) => !card.deletedAt && !card.archivedAt),
    archived: cards.filter((card) => !card.deletedAt && card.archivedAt),
    deleted: cards
      .filter((card) => card.deletedAt)
      .sort((a, b) => a.deletedAt!.getTime() - b.deletedAt!.getTime()),
  };
}
