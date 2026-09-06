import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { mintId } from "@scenephonie/schema";

import { authorizeProjectForUser } from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, screenplays, users } from "@/db/schema";
import { createScreenplay } from "@/persistence";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import { cleanupExpiredGuests, GUEST_TTL_DAYS } from "./guest-ttl";
import { demoScreenplay } from "./demo-screenplay";

/**
 * TTL 清理有兩種失敗方式，而它們一樣糟：
 *
 * - **該清的沒清** —— 「臨時」被寫成「永久」，容量由陌生人決定；
 * - **不該清的清了** —— 刪的是一個人的稿，而且沒有復原路徑（`users` 一走，cascade 全走）。
 *
 * 所以下面四個案例把邊界的兩側都釘住：過期的訪客、還在寫的訪客、剛進來的訪客、受邀者。
 *
 * ⚠️ `getDb()` 一律在測試內部呼叫（理由見 `guest-entry.integration.test.ts`）。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-05T00:00:00Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

/** 遠比 TTL 舊 —— 不卡在邊界上，測的是政策不是浮點誤差。 */
const LONG_AGO = daysAgo(GUEST_TTL_DAYS + 3);
/** 還在 TTL 之內。 */
const RECENTLY = daysAgo(1);

describe.skipIf(!hasDatabase)("訪客資料的 TTL 清理（需要 Postgres）", () => {
  const created: string[] = [];

  /** 種一位使用者，可選地連同他的專案與一份稿。回傳 `users.id`。 */
  const seedUser = async (options: {
    isDemo: boolean;
    createdAt: Date;
    lastWroteAt?: Date;
  }): Promise<{ userId: string; projectId?: string }> => {
    const db = getDb();
    const userId = mintId(USER_ID_PREFIX);
    created.push(userId);

    await db.insert(users).values({
      id: userId,
      name: "測試",
      email: `${userId}@example.test`,
      isDemo: options.isDemo,
      createdAt: options.createdAt,
      updatedAt: options.createdAt,
    });

    if (!options.lastWroteAt) return { userId };

    const projectId = mintId(PROJECT_ID_PREFIX);
    await db.insert(projects).values({
      id: projectId,
      type: SINGLE_SCREENPLAY_PROJECT,
      title: "測試專案",
      ownerId: userId,
      createdAt: options.createdAt,
      updatedAt: options.createdAt,
    });
    // 劇本走 persistence 那條真的路，而不是自己 INSERT 一列 —— 那張表上有幾個欄位是
    // persistence 的內部手段，這個檔案不該認識它們（`persistence-boundary.test.ts` 會抓）。
    const project = await authorizeProjectForUser(userId, projectId);
    if (!project) throw new Error("剛種下的專案卻過不了 gate");
    await createScreenplay(project, demoScreenplay());

    // 「最後一次存檔」是這支清理任務唯一的判準，所以測試要能指定它。
    await db
      .update(screenplays)
      .set({ updatedAt: options.lastWroteAt })
      .where(eq(screenplays.projectId, projectId));

    return { userId, projectId };
  };

  const stillThere = async (userId: string): Promise<boolean> => {
    const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.id, userId));
    return rows.length > 0;
  };

  afterEach(async () => {
    if (created.length > 0) await getDb().delete(users).where(inArray(users.id, created));
    created.length = 0;
  });

  it("超過 TTL 沒動過稿的訪客被清掉，連他的專案與稿一起", async () => {
    const { userId, projectId } = await seedUser({
      isDemo: true,
      createdAt: LONG_AGO,
      lastWroteAt: LONG_AGO,
    });

    const deleted = await cleanupExpiredGuests(NOW);

    expect(deleted).toContain(userId);
    expect(await stillThere(userId)).toBe(false);

    // cascade 是這支清理任務唯一的實作手段 —— 它真的有接上，不是註解裡的說法。
    const leftovers = await getDb()
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId ?? ""));
    expect(leftovers).toEqual([]);
  });

  it("還在寫的訪客不會被清掉（帳號很舊也一樣）", async () => {
    const { userId } = await seedUser({
      isDemo: true,
      createdAt: LONG_AGO,
      lastWroteAt: RECENTLY,
    });

    expect(await cleanupExpiredGuests(NOW)).not.toContain(userId);
    expect(await stillThere(userId)).toBe(true);
  });

  it("剛進來、還沒存過稿的訪客不會被清掉", async () => {
    const { userId } = await seedUser({ isDemo: true, createdAt: RECENTLY });

    expect(await cleanupExpiredGuests(NOW)).not.toContain(userId);
    expect(await stillThere(userId)).toBe(true);
  });

  it("受邀者永遠不被碰 —— 帳號舊、又整年沒寫，照樣留著", async () => {
    const { userId } = await seedUser({
      isDemo: false,
      createdAt: LONG_AGO,
      lastWroteAt: LONG_AGO,
    });

    expect(await cleanupExpiredGuests(NOW)).not.toContain(userId);
    expect(await stillThere(userId)).toBe(true);
  });
});
