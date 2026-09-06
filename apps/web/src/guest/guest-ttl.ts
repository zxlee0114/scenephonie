import { and, eq, gte, lt, notExists } from "drizzle-orm";

import { getDb } from "@/db/client";
import { projects, screenplays, users } from "@/db/schema";

/**
 * 訪客資料的 TTL 清理（票券 25 §6）。
 *
 * > 一個永遠不清理的 ephemeral user 表，等於把「臨時」寫成了「永久」——
 * > 那是概念上的不誠實。
 *
 * 省錢只是附帶：每位訪客都會長出一份完整的劇本 doc，成長由陌生人驅動、無上限，而作品集的
 * 用途恰恰是要給人點進來試。
 *
 * ## 這裡刻意**沒有**長出來的東西
 *
 * 沒有 demo lifecycle domain（票券 24 §6）：沒有狀態機、沒有 `expired` 旗標、沒有「即將到期」
 * 的通知、沒有續期。**只有一條 DELETE**，其餘全部靠 FK cascade —— 刪掉那一列 `users`，
 * 他的 session、專案、劇本、備份跟著走。要新增一種「該清掉的東西」時，該做的是掛上 FK，
 * 不是在這裡多寫一段。
 *
 * ⚠️ 它**不是授權**（不變式 I）：這支函式決定「哪一列該消失」，從不決定「誰能看什麼」。
 */

/** 多久沒動就算過期。政策值，票券 25 §6 定的初始值。 */
export const GUEST_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 比這個時間更早的活動就算「過期了」。 */
export const guestTtlCutoff = (now: Date): Date => new Date(now.getTime() - GUEST_TTL_DAYS * DAY_MS);

/**
 * 清掉過期的訪客。回傳被刪掉的 `users.id`。
 *
 * **「最後活動」＝ 他那份稿最後一次被存檔的時間**，沒有稿就退回帳號建立時間。
 *
 * 為什麼不看 session：session 會被 cookie cache 與背景刷新推著走，於是「還活著」會變成
 * 「瀏覽器還開著」而不是「還有人在寫」。改稿才是這個產品裡唯一算數的活動，而它剛好已經
 * 被記在 `screenplays.updated_at` 上 —— 不必為了這支清理任務多寫一個欄位。
 *
 * `now` 由呼叫端給，這樣測試不必等七天，也不必凍結系統時鐘。
 */
export async function cleanupExpiredGuests(now: Date = new Date()): Promise<string[]> {
  const cutoff = guestTtlCutoff(now);
  const db = getDb();

  /** 這個人在 TTL 之內動過稿嗎。相關子查詢 —— `users.id` 是外層那一列的。 */
  const recentlyWrote = db
    .select({ screenplayId: screenplays.id })
    .from(screenplays)
    .innerJoin(projects, eq(screenplays.projectId, projects.id))
    .where(and(eq(projects.ownerId, users.id), gte(screenplays.updatedAt, cutoff)));

  const deleted = await db
    .delete(users)
    .where(
      and(
        // 受邀者永遠不會被這支函式碰到。這是整個檔案唯一讀 `is_demo` 的地方。
        eq(users.isDemo, true),
        // 剛進來、還沒存過任何一次稿的訪客不會被誤殺。
        lt(users.createdAt, cutoff),
        notExists(recentlyWrote),
      ),
    )
    .returning({ id: users.id });

  return deleted.map((row) => row.id);
}
