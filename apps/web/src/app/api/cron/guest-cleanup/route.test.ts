import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

/**
 * 這是一支**會刪資料**的端點，所以它的預設值必須是「關著」。
 *
 * 下面三個案例都在碰資料庫之前就回頭了 —— 那正是重點：沒有正確的 secret，這支端點連
 * `getDb()` 都不會叫。
 */
const request = (authorization?: string): Request =>
  new Request("http://localhost/api/cron/guest-cleanup", {
    headers: authorization ? { authorization } : {},
  });

describe("訪客清理排程的門", () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  // HTTP header 只能裝 ByteString，所以這裡的 secret 是 ASCII —— 不是風格，是 `Request` 的規則。
  it("沒設 `CRON_SECRET` 就整支關閉（不是放行）", async () => {
    delete process.env.CRON_SECRET;

    expect((await GET(request("Bearer whatever"))).status).toBe(404);
  });

  it("secret 不對就回 404", async () => {
    process.env.CRON_SECRET = "the-right-secret";

    expect((await GET(request("Bearer the-wrong-secret"))).status).toBe(404);
    expect((await GET(request())).status).toBe(404);
  });

  it("回 404 而不是 401 —— 不承認這支端點存在", async () => {
    // 與 gate 回 404 同一條理由（票券 06）：403／401 等於告訴掃描器「這裡有東西，
    // 只是你沒有鑰匙」。一支排程端點沒有理由對外自我介紹。
    process.env.CRON_SECRET = "the-right-secret";

    const response = await GET(request("Bearer the-wrong-secret"));

    expect(response.status).not.toBe(401);
    expect(await response.text()).toBe("");
  });
});
