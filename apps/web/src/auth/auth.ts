import { mintId } from "@scenephonie/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";

import { ALLOWLIST_ENV, isAllowedEmail } from "./allowlist";

/**
 * authentication —— 回答「你是誰」，**只回答這一句**。
 *
 * 它是一個**可替換的 infrastructure 元件**（ADR-0011）：授權不在這裡，也不在 middleware 裡，
 * 而在 `src/authorization/` 的 application layer gate。這條分工的代價是每個 route handler
 * 要自己叫 gate，買到的是「換 library 時 `projects.owner_id` 一個字不動」。
 *
 * **`users.id` 由我們鑄造**（下面的 `generateId`）—— 這是不做影子表的前提，也是票券 30 的
 * blocking acceptance criterion。identity chain：`Scenephonie UserId → users.id → projects.owner_id`。
 *
 * **provider identity（Google `sub`）留在 `accounts` 表，domain 永不讀它。**
 */

/** `users.id` 的前綴。**只有這一個是領域事實** —— `projects.owner_id` 指著它。 */
export const USER_ID_PREFIX = "usr_";

/** 認不得的 model（日後某個 plugin 帶來的表）用的通用前綴。 */
const UNKNOWN_MODEL_PREFIX = "id_";

/** auth library 的 model 名 → 我們的 id 前綴。全專案同一個形狀：前綴 ＋ nanoid。 */
const MODEL_PREFIXES: Record<string, string> = {
  // 文件的範例同時檢查單數與複數，`modelName` 改名後傳進來的確切字串有歧義（票券 30 §1），
  // 所以兩種拼法都掛上去 —— 兩邊指向同一個前綴，猜錯也不會鑄出錯的 id。
  user: USER_ID_PREFIX,
  users: USER_ID_PREFIX,
  session: "ses_",
  sessions: "ses_",
  account: "acc_",
  accounts: "acc_",
  verification: "ver_",
  verifications: "ver_",
};

/**
 * 其餘三個前綴純粹是讓 `psql` 裡一眼看得出這列是什麼。
 *
 * ⚠️ 認不得的 model **也要鑄一個 id**，不能回 `false` —— `false` 在 Better Auth 的語意是
 * 「不要產生、交給資料庫」，而這些表的主鍵都是**沒有 default 的 `text`**，那會變成一次
 * NOT NULL 失敗。日後 plugin 帶進新表時，它拿到的仍是本專案的形狀：前綴 ＋ nanoid。
 */
const generateId = ({ model }: { model: string }): string =>
  mintId(MODEL_PREFIXES[model] ?? UNKNOWN_MODEL_PREFIX);

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 未設定`);
  return value;
};

type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

function createAuth() {
  return betterAuth({
    baseURL: requireEnv("BETTER_AUTH_URL"),
    secret: requireEnv("BETTER_AUTH_SECRET"),

    // Better Auth 對 Drizzle 只做 code generation，不碰資料庫 —— 表就是我們自己 schema 裡的
    // 那四張，migration 走我們自己的 drizzle-kit 鏈（票券 30 §2）。
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
    }),

    // ⚠️ 表名是複數，所以 `modelName` 要跟著改，否則 adapter 在執行期找不到表。
    user: { modelName: "users" },
    session: {
      modelName: "sessions",
      // DB session（session 存我們自己的 Postgres）＋ cookie cache：把 session 放進一個
      // 五分鐘的簽章 cookie，省去每次 request 的 DB 往返。`compact` 是三種編碼裡最小的
      // （Base64url ＋ HMAC-SHA256）。middleware 讀得到它，但**middleware 不是授權的家**。
      cookieCache: { enabled: true, strategy: "compact", maxAge: 5 * 60 },
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },

    advanced: { database: { generateId } },

    // v1 唯一的登入方式。magic link 不進 v1（成本是 email delivery／token lifecycle／
    // account linking 的 operational surface），密碼出局（票券 24 §5）。
    socialProviders: {
      google: {
        clientId: requireEnv("GOOGLE_CLIENT_ID"),
        clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      },
    },

    databaseHooks: {
      user: {
        create: {
          /**
           * allowlist —— 不在清單上的人連 `users` 都不會有一列。
           *
           * ⚠️ **這是 Google 那道門，不是授權真理來源**（不變式 I）。它刻意只擋在這裡：
           * allowlist 的定義是「Google OAuth 的 registration/access policy」（票券 24 §7），
           * 而票券 07 的訪客入口**不進 allowlist** —— 若改成每次請求都查，訪客就得長出一個
           * 授權例外，正是 ADR-0011 §③ 要避免的東西。撤銷存取＝刪掉那一列 `users`
           * （FK cascade 連 session 一起帶走）。
           */
          before: async (user) => {
            if (!isAllowedEmail(user.email, process.env[ALLOWLIST_ENV])) {
              throw new APIError("FORBIDDEN", { message: "這個帳號不在受邀清單上" });
            }
          },
        },
      },
    },

    // ⚠️ 必須放在陣列**最後**，否則 Server Action 裡的 `Set-Cookie` 不會生效。
    plugins: [nextCookies()],
  });
}

/**
 * lazy —— 不在 module load 時建立，好讓 `next build` 不需要 auth 的環境變數
 * （與 `getDb()` 同一個理由與同一種形狀）。
 */
export function getAuth(): Auth {
  cached ??= createAuth();
  return cached;
}
