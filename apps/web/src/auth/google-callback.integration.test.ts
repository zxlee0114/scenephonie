import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";

import { NOT_INVITED_ERROR } from "./allowlist";

/**
 * 票券 64：allowlist 擋人之後，被擋的人**真的會回到登入頁、而且網址說得出原因**。
 *
 * 這條路上有三個不歸我們管的環節 —— hook 拋的錯怎麼被 callback 接住、callback 用什麼當
 * `error`、`errorCallbackURL` 後面怎麼接 query —— 任何一個在 Better Auth 升版時改了，
 * 登入頁都會靜默地退回「請再試一次」。所以這支測試走**整條真的 OAuth 往返**：
 * `sign-in/social` 發出 state 與 cookie，`callback/google` 收回來。唯一換掉的是 Google 的
 * token endpoint（測試不可能拿到真的授權碼），它回一張沒簽章的 id token —— Google provider
 * 的 `getUserInfo` 只 decode 不驗章，驗章是 `idToken` 登入那條路的事，不是 callback 的。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const STRANGER = "callback-stranger@example.test";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ERROR_CALLBACK_URL = "/login";

/** 只有 payload 有意義的 JWT —— `decodeJwt` 不看 header 與簽章。 */
const unsignedIdToken = (claims: Record<string, unknown>): string => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`;
};

describe.skipIf(!hasDatabase)("Google OAuth callback 被 allowlist 擋下（需要 Postgres）", () => {
  let baseURL: string;

  beforeAll(() => {
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-for-signing-anything-real";
    process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
    process.env.AUTH_ALLOWED_EMAILS = "nobody-here@example.test";
    baseURL = `${process.env.BETTER_AUTH_URL}/api/auth`;

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== GOOGLE_TOKEN_ENDPOINT) return realFetch(input, init);
      return Response.json({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: unsignedIdToken({
          sub: "google-sub-of-a-stranger",
          email: STRANGER,
          email_verified: true,
          name: "Stranger",
        }),
      });
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await getDb().delete(users).where(eq(users.email, STRANGER));
  });

  it("回到登入頁，`error` 只有一個，就是 allowlist 的錯誤碼", async () => {
    const { getAuth } = await import("./auth");
    const auth = getAuth();

    // 第一步：跟登入頁那顆按鈕送一樣的東西，拿到 Google 授權網址（裡面帶 state）與 state cookie。
    const start = await auth.handler(
      new Request(`${baseURL}/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/projects",
          errorCallbackURL: ERROR_CALLBACK_URL,
        }),
      }),
    );
    const { url: authorizationURL } = (await start.json()) as { url: string };
    const state = new URL(authorizationURL).searchParams.get("state") ?? "";
    const cookie = start.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");

    // 第二步：Google 帶著授權碼回到 callback。
    const callback = await auth.handler(
      new Request(`${baseURL}/callback/google?code=test-code&state=${encodeURIComponent(state)}`, {
        headers: { cookie },
      }),
    );

    expect(callback.status).toBe(302);
    const location = new URL(callback.headers.get("location") ?? "", "http://placeholder.test");
    expect(location.pathname).toBe(ERROR_CALLBACK_URL);
    expect(location.searchParams.getAll("error")).toEqual([NOT_INVITED_ERROR]);

    const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.email, STRANGER));
    expect(rows).toEqual([]);
  });
});
