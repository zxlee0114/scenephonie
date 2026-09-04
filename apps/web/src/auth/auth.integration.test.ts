import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema";

/**
 * 票券 30 把兩件事列為「階段 3.5 開工前的 spike」：`user.id` 的實際產生行為，與 allowlist
 * 這道門實際擋不擋得住。**spike 做完就變成這個檔案** —— 一次性的驗證會過期，測試不會。
 *
 * 它守的是 blocking acceptance criterion：
 *
 * > identity chain `Scenephonie UserId → users.id → projects.owner_id` 成立，`usr_` + nanoid
 * > 原封不動，**因此不需要影子表**。
 *
 * 這條一旦破了（升 minor 版時最有可能），`projects.owner_id` 指向的東西就變了 ——
 * 那不是一個小 bug，是票券 24 §4 的裁決要重評。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const ALLOWED = "spike-allowed@example.test";
const REJECTED = "spike-rejected@example.test";

describe.skipIf(!hasDatabase)("Better Auth 的 id 與 allowlist（需要 Postgres）", () => {
  const db = getDb();
  const emails = [ALLOWED, REJECTED];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internalAdapter 的型別在 library 內部
  let internalAdapter: any;

  beforeAll(async () => {
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-for-signing-anything-real";
    process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
    process.env.AUTH_ALLOWED_EMAILS = ALLOWED;

    const { getAuth } = await import("./auth");
    ({ internalAdapter } = await getAuth().$context);
  });

  afterAll(async () => {
    // sessions 隨 FK cascade 一起走。
    await db.delete(users).where(inArray(users.email, emails));
  });

  it("`users.id` 是 `usr_` + nanoid，session 的 FK 跟著它走", async () => {
    const user = await internalAdapter.createUser({ email: ALLOWED, name: "Spike" });
    expect(user.id).toMatch(/^usr_.+/);

    const session = await internalAdapter.createSession(user.id);
    expect(session.id).toMatch(/^ses_.+/);
    expect(session.userId).toBe(user.id);

    // 落庫的那一列才算數 —— 回傳值可能只是記憶體裡的物件。
    const [stored] = await db
      .select({ id: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(inArray(sessions.userId, [user.id]));
    expect(stored?.userId).toBe(user.id);
  });

  it("不在 allowlist 上的 email 連 `users` 都不會有一列", async () => {
    await expect(internalAdapter.createUser({ email: REJECTED, name: "Stranger" })).rejects.toThrow();

    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.email, [REJECTED]));
    expect(rows).toEqual([]);
  });
});
