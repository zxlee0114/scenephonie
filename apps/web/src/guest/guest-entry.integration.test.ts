import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, screenplays, users } from "@/db/schema";
import { PROJECT_ID_PREFIX } from "@/projects/project-store";

import { DEMO_PROJECT_TITLE } from "./demo-screenplay";
import { enterAsGuest } from "./guest-entry";

/**
 * 訪客入口的三條驗收框，全部要在**真的走過那道門之後**才算數：
 *
 * 1. 點進來的人拿到自己的 user 身分與自己的一份範例稿；
 * 2. 兩個訪客互不覆蓋（不是共用帳號）；
 * 3. `is_demo` 真的落在那一列上。
 *
 * 第 3 條特別需要落庫驗證：`is_demo` 是把 Better Auth `anonymous` plugin 的 `isAnonymous`
 * 用 `schema.user.fields` 映過去的，而**那個映射沒有文件保證**。猜錯不會有人喊 —— 訪客只是
 * 靜靜地變成一個永遠不會被 TTL 清掉的普通 user，然後在某個容量告警裡被發現。
 *
 * ⚠️ `getDb()` 一律在 hook／測試**內部**呼叫：`describe.skipIf` 只跳過執行，vitest 仍會跑
 * describe 的 callback 來列舉測試，提到 body 頂層會讓沒設 `DATABASE_URL` 的環境在收集階段就爆
 * （票券 06 驗收時修掉的真缺陷）。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("訪客入口（需要 Postgres）", () => {
  const guestIds: string[] = [];

  /** 走一次真的門，並記下這一列好在最後清掉。 */
  const enter = async (): Promise<{ projectId: string; ownerId: string }> => {
    const projectId = await enterAsGuest(new Headers());
    const [row] = await getDb()
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));
    const ownerId = row?.ownerId ?? "";
    guestIds.push(ownerId);
    return { projectId, ownerId };
  };

  beforeAll(() => {
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-for-signing-anything-real";
    process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";

    // ⚠️ 清單裡**沒有**訪客的 placeholder email，而且不可能有（它是每次現產的）。
    // 下面每一個通過的測試因此同時證明了「訪客那道門不查 allowlist」——
    // 若哪天有人把 allowlist 改成每次請求都查，這個檔案會整片紅。
    process.env.AUTH_ALLOWED_EMAILS = "nobody-here@example.test";
  });

  afterAll(async () => {
    // 專案、劇本、session 隨 FK cascade 一起走。
    if (guestIds.length > 0) await getDb().delete(users).where(inArray(users.id, guestIds));
  });

  it("拿到自己的 user 身分與自己的一份範例專案", async () => {
    const { projectId, ownerId } = await enter();

    expect(projectId).toMatch(new RegExp(`^${PROJECT_ID_PREFIX}`));
    expect(ownerId).toMatch(new RegExp(`^${USER_ID_PREFIX}`));

    const [project] = await getDb()
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(project?.title).toBe(DEMO_PROJECT_TITLE);

    const scripts = await getDb()
      .select({ id: screenplays.id, doc: screenplays.doc })
      .from(screenplays)
      .where(eq(screenplays.projectId, projectId));
    expect(scripts).toHaveLength(1);
    expect((scripts[0]?.doc as { content: unknown[] }).content.length).toBeGreaterThan(0);
  });

  it("`is_demo` 落在那一列上（受邀者不會被誤標）", async () => {
    const { ownerId } = await enter();

    const [row] = await getDb()
      .select({ isDemo: users.isDemo })
      .from(users)
      .where(eq(users.id, ownerId));

    expect(row?.isDemo).toBe(true);
  });

  it("兩個訪客互不覆蓋 —— 各自的身分、各自的專案、各自的稿", async () => {
    const first = await enter();
    const second = await enter();

    expect(second.ownerId).not.toBe(first.ownerId);
    expect(second.projectId).not.toBe(first.projectId);

    const sceneIdsOf = async (projectId: string): Promise<string[]> => {
      const [row] = await getDb()
        .select({ doc: screenplays.doc })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId));
      const content = (row?.doc as { content: { attrs: { sceneId: string } }[] }).content;
      return content.map((scene) => scene.attrs.sceneId);
    };

    const [a, b] = await Promise.all([sceneIdsOf(first.projectId), sceneIdsOf(second.projectId)]);

    expect(a).not.toHaveLength(0);
    // 連場次的識別碼都不共用 —— 共用的東西才有辦法互相覆蓋。
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
