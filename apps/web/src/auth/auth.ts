import { mintId } from "@scenephonie/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins/anonymous";

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
 *
 * **兩道門，一條 pipeline**（票券 07）：Google OAuth 與訪客入口都在這裡取得一個正常的
 * `users.id`，之後走完全相同的 `User → ownership → Authorization → Command`。
 * 差別只有兩處，兩處都在這個檔案裡：訪客那一列 `is_demo` 為 true（給 TTL 清理用的
 * lifecycle metadata），以及 allowlist 只長在 Google 那道門上。
 */

/** `users.id` 的前綴。**只有這一個是領域事實** —— `projects.owner_id` 指著它。 */
export const USER_ID_PREFIX = "usr_";

/**
 * 訪客那道門的 endpoint path（`anonymous` plugin 的 `signInAnonymous`）。
 *
 * 下面 allowlist 的 hook 靠它認出「這次建立 user 不是 Google 註冊」。**寫成常數是因為
 * 它有兩個讀者**（hook 與 `guest/guest-entry.ts` 的註解對照），而拼錯一個字的後果是
 * 訪客入口整條壞掉、或 allowlist 靜默失效 —— 後者是安全問題，不能靠字串字面值。
 */
export const GUEST_SIGN_IN_PATH = "/sign-in/anonymous";

/** 訪客那一列 `users.name` 的值。使用者看不到它，`psql` 裡看得到。 */
const GUEST_USER_NAME = "訪客";

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
           *
           * 訪客那道門走的是 `GUEST_SIGN_IN_PATH`，不經過這條規則。**這不是「訪客的例外」**
           * —— 例外是「規則適用於你，但這次放你過」，而這裡是這條規則從來就只長在 Google
           * 那道門上（它擋的是註冊，訪客沒有在註冊成為受邀者）。訪客因此**也沒有取得任何
           * 超出正常 User authorization model 的東西**（票券 24 §7）：他拿到的是自己的
           * `users.id` 與自己的專案，跟受邀者一模一樣。
           *
           * 其餘任何來源（未知 path、或根本不在 endpoint 裡，例如測試直呼 adapter）
           * **一律查清單** —— fail closed：漏掉一道門的後果是「誰都進得來」，
           * 而漏掉訪客的後果只是「訪客入口壞掉」。這兩種失敗的代價不對稱。
           */
          before: async (user, ctx) => {
            if (ctx?.path === GUEST_SIGN_IN_PATH) return;
            if (!isAllowedEmail(user.email, process.env[ALLOWLIST_ENV])) {
              throw new APIError("FORBIDDEN", { message: "這個帳號不在受邀清單上" });
            }
          },
        },
      },
    },

    plugins: [
      /**
       * 訪客入口（票券 07）：**不經任何 OAuth provider 就能建 user ＋ session**。
       *
       * 選它而不是自己鑄一組 user／session，是因為「怎麼發一個合法的 session」是
       * auth library 的職責 —— 自己來等於把 cookie 簽章、cookie cache、過期規則
       * 抄第二份，然後讓兩份慢慢分岔。
       *
       * ⚠️ **plugin 的 `isAnonymous` 在我們這一側叫 `is_demo`**（規格 §6.2）：`fields`
       * 映射把 model 欄位名換成 Drizzle schema 的 `isDemo` 屬性 → `is_demo` 欄。
       * 這個映射是**未經文件保證的行為**，所以有一支整合測試直接驗落庫的那一列
       * （`guest/guest-entry.integration.test.ts`）—— 猜錯的話訪客會靜默地變成
       * 一個永遠不會被清理的普通 user。
       *
       * **不設 `onLinkAccount`，也不需要**：v1 沒有「訪客升級成正式帳號」這件事，
       * 因為正式帳號的門是 allowlist —— 一個陌生訪客即使去點 Google 登入也進不來
       * （票券 30 §5(d) 擔心的 `projects.owner_id` 被 cascade 帶走，前提是 link 真的
       * 會發生）。要開放升級，得先回答「誰可以成為受邀者」，那是 allowlist 的問題，
       * 不是這個 plugin 的問題。
       */
      anonymous({
        schema: { user: { fields: { isAnonymous: "isDemo" } } },
        generateName: () => GUEST_USER_NAME,
      }),

      // ⚠️ 必須放在陣列**最後**，否則 Server Action 裡的 `Set-Cookie` 不會生效。
      nextCookies(),
    ],
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
