# Better Auth 選型評估（對照 Auth.js v5）

研究票：[30-better-auth-evaluation](../issues/30-better-auth-evaluation.md)
查證日期：**2026-09-01**（所有 URL 均於當日訪問）
相關 ADR：[ADR-0011 認證身分不直接授予領域權限](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)

> **關於證據等級。** 本報告每一條結論都標示「已驗證／部分驗證／未驗證」。
> 「已驗證」＝ 有 2026 年可查證的一手來源（官方文件、GitHub API、npm registry、原始碼、release notes）。
> 「部分驗證」＝ 官方文件明說，但未讀到對應原始碼或未實測。
> 「未驗證」＝ 只有二手來源或純推論，需 spike 才能定案。

---

## Verdict

**選 Better Auth。**（`better-auth@1.7.2`，2026-08-26 發布）

**Blocking criterion（第 1 條，`user.id` 由 Scenephonie 控制）：通過。** `advanced.database.generateId` 接受一個能看到 `model` 名稱的自訂函式，Drizzle/PostgreSQL 下 `id` 產生為 `text('id').primaryKey()`、所有 FK 跟著主鍵策略走，所以 `usr_` + nanoid 這條 identity chain 成立，**不需要 shadow table**，票券 24 §4 的「一張表」裁決維持。

理由：

1. **Blocking criterion 通過，且 Auth.js v5 在同一條上只能靠 Drizzle 的 `$defaultFn` 繞（能繞，但 id 的產生規則散落在 schema 檔而非 auth 設定，且 v5 的 `accounts`／`sessions` 主鍵是 composite / `sessionToken`，形狀更難掌握）。**
2. **Auth.js 已進入維護模式，而且是 Better Auth 團隊在維護它。** 2025-09-26 官方公告：Auth.js 交由 Better Auth 團隊維護，「若你在開新專案，我們推薦 Better Auth」。到 2026-09-01 為止 `next-auth` 的 `latest` tag 仍是 v4（`4.24.15`），v5 仍停在 `5.0.0-beta.32`。選 Auth.js v5 等於選一個被它的維護者本人勸退的 beta。
3. **schema 主權在我們手上。** Better Auth 的 CLI 對 Drizzle 只做 `generate`（吐出 schema 檔），不做 `migrate`；migration 由 `drizzle-kit` 產生，天然併進我們自己的 migration 鏈。
4. **訪客入口有第一方解。** `anonymous` plugin 能在不經過任何 OAuth provider 的情況下建立 session，並提供 `onLinkAccount` 作為日後 link 到 Google 帳號的掛點 —— 正是票券 24 的訪客體驗形狀。
5. **維護風險可控但不為零。** 2026-07-07 被 Vercel 收購、維持 MIT；1.0 已發布 21 個月；但 1.7.0（2026-08-18，兩週前）帶著一批 breaking changes。這是「活躍」的代價，不是「不穩」的證據，但**要求我們鎖 minor 版本並把升版當作有成本的事**。

**不動搖 ADR-0011 不變式 H。** 但有一個明確的警戒點：Better Auth 的 `organization` plugin **自帶一套 access control（roles / statements / `hasPermission`）**，那正是不變式 H 禁止的「library 成為 domain authorization 真理來源」。結論是：日後採用 organization plugin 時，**只採用它的資料表，不採用它的授權判斷**。詳見〈對 domain model 的衝擊〉。

---

## 1. `user.id` 的產生規則能不能由 Scenephonie 控制？（blocking）

### 結論：**能。已驗證（原始碼層級為部分驗證）。**

#### Better Auth

**設定路徑（現行）：`advanced.database.generateId`**

官方 options reference 給出的簽名（逐字）：

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: (((options: {
        model: LiteralUnion<Models, string>;
        size?: number;
      }) => {
        return "my-super-unique-id";
      })) | false | "serial" | "uuid",
    },
  },
});
```

> 「Accepts a custom function, `false`, `"serial"`, or `"uuid"` (default: random base62 string)」
> — <https://www.better-auth.com/docs/reference/options>（2026-09-01 查證）

**關鍵在於 `options.model`**：自訂函式拿得到目前正在寫入的 model 名稱（`"user"` / `"session"` / `"account"` / `"verification"` / plugin 自己的 model），所以能做 per-model prefix：

```ts
// 形狀示意（未實測，需 spike 確認 model 字串的確切值）
advanced: {
  database: {
    generateId: ({ model }) => {
      if (model === "user") return `usr_${nanoid()}`;
      return `${prefixOf(model)}_${nanoid()}`;
    },
  },
}
```

<https://www.better-auth.com/docs/concepts/database>（2026-09-01 查證）明確示範了 per-model 分歧的用法（文件的例子是 user 用 serial、其餘用 UUID），所以 per-model 客製是**設計意圖之內**，不是我們在鑽漏洞。

**⚠️ 舊路徑已變更。** 早期版本是 `advanced.generateId`（頂層），現已 deprecated，正確路徑是 `advanced.database.generateId`。相關 issue：[#3172](https://github.com/better-auth/better-auth/issues/3172)、[#2275](https://github.com/better-auth/better-auth/issues/2275)。寫程式碼時**不要照抄 2025 年的教學文**。

**id 欄位型別（Drizzle + PostgreSQL）：已驗證。**
CLI 的 Drizzle generator 原始碼（`packages/cli/src/generators/drizzle.ts`，2026-09-01 讀取 `main` 分支）顯示：

- 預設（非 uuid、非 serial）：PostgreSQL / SQLite → `text('id').primaryKey()`；MySQL → `varchar('id', { length: 36 }).primaryKey()`
- `generateId: "uuid"` 且 pg → `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`).primaryKey()`
- `generateId: "serial"` 且 pg → `integer("id").generatedByDefaultAsIdentity().primaryKey()`

**FK 跟著主鍵策略走：已驗證。** 同一份 generator 有 `if (field.references?.field === 'id')` 的分支，對指向 `id` 的欄位套用與主鍵一致的型別（text id → `text('userId')`）。

→ **PostgreSQL 下 id 是無長度上限的 `text`，`usr_` + nanoid（21 字元 → 共 25 字元）完全放得下，`session.userId` / `account.userId` 等 FK 也自動是 `text`。identity chain `Scenephonie UserId → users.id → projects.owner_id` 成立。**

#### 已知風險（必須 spike 驗證的部分）

這個區域**有 bug 歷史**，雖然都不落在我們要走的那條路上（純自訂函式），仍應在階段 3.5 開工前做一次 15 分鐘 spike：

| Issue | 內容 | 與我們的關係 |
|---|---|---|
| [#2275](https://github.com/better-auth/better-auth/issues/2275) | `advanced.generateId: false` 自 1.2.6 起失效 | 走 deprecated 路徑，不影響 |
| [#3172](https://github.com/better-auth/better-auth/issues/3172) | mongodb adapter 只認 deprecated 路徑 | 非我們的 adapter |
| [#1060](https://github.com/better-auth/better-auth/issues/1060) | `databaseHooks.*.before` 回傳的 id 會被覆蓋（closed as not planned） | 我們不從 hook 給 id，不影響 |
| [#6447](https://github.com/better-auth/better-auth/issues/6447) | `generateId: false` 在 stateless mode 造成 401 | 我們不用 `false` |
| [PR #9068](https://github.com/better-auth/better-auth/pull/9068) | 2026 年修正 pg adapter 下 `generateId: "uuid"` 時 hook 回傳 id 被丟棄 | 不用 `"uuid"`，不影響 |

**Spike 內容**：起一個最小 Better Auth + drizzleAdapter(pg) 專案，設 `generateId: ({model}) => model === "user" ? \`usr_${nanoid()}\` : ...`，跑一次 Google OAuth（或 anonymous sign-in），檢查 DB 內 `user.id`、`session.userId`、`account.userId` 三處的實際值。

#### Auth.js v5

**結論：能，但機制不同、且更醜。部分驗證。**

`@auth/drizzle-adapter` 的 pg schema（原始碼 `packages/adapter-drizzle/src/lib/pg.ts`，2026-09-01 讀取 `main`）：

```ts
pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
})
```

id 產生在 **Drizzle schema 的 `$defaultFn`**，不在 auth 設定裡。所以要改成 `usr_` + nanoid，是改我們自己的 schema 檔 —— 技術上可行且直接。

但形狀有兩個副作用：

1. **id 產生規則的家在 schema 檔，不在 auth 設定。** 這其實對我們有利（我們本來就想擁有 schema），但代表 auth library 對 id 格式完全無感，換 adapter 時規則不會跟著走。
2. **v5 的其他表主鍵形狀不對稱**：`account` 是 `primaryKey(provider, providerAccountId)` composite、`session` 主鍵是 `sessionToken`、`verificationToken` 是 `primaryKey(identifier, token)`。只有 `user` 有一個獨立的 surrogate id。這比 Better Auth 的「每張表都有 `id`」一致性差，日後要對 `account` 做任何我們自己的引用會很彆扭（雖然 ADR-0011 說 domain 永不讀 `account`，所以影響有限）。

#### 若答案為否會怎樣（不成立，僅記錄）

答案是「能」，所以 **shadow table 不需要**。此處僅為留檔：shadow table 的代價會是（a）每次 sign-in 都要維護 `auth_user.id ↔ users.id` 的 1:1 對映與其建立時序；（b）多一次 join 或一次額外查詢才能從 session 拿到 domain `UserId`；（c）刪除／匿名化流程要跨兩張表保持一致；（d）票券 24 §4 需重評。這些都不用付。

---

## 2. Next.js App Router + Drizzle + PostgreSQL 整合現況

### 結論：**schema 由我們擁有，CLI 只做 code generation，migration 走我們自己的 drizzle-kit 鏈。已驗證。**

**CLI 是 npm 上的 `auth` 套件**（不是舊名 `@better-auth/cli`）：

> description: "The CLI for Better Auth"，latest `1.7.2`，bin `auth` / `better-auth`
> — <https://registry.npmjs.org/auth>（2026-09-01 查證）

**兩個命令，對 Drizzle 只有一個能用：**

| 命令 | 作用 | Drizzle 支援 |
|---|---|---|
| `npx auth@latest generate` | 產生 ORM schema 檔（Prisma / Drizzle）或 Kysely 用的 SQL | ✅ |
| `npx auth@latest migrate` | 直接改資料庫 | ❌ **僅支援內建 Kysely adapter** |

> 「Supported for the built-in Kysely adapter only.」
> 「Works exclusively with Kysely; use CLI migrations for Prisma or Drizzle.」
> — <https://www.better-auth.com/docs/concepts/database>（2026-09-01 查證）

Drizzle 文件明說流程是：

> `npx drizzle-kit generate # generate the migration file`
> `npx drizzle-kit migrate # apply the migration`
> — <https://www.better-auth.com/docs/adapters/drizzle>（2026-09-01 查證）

**→ 這正是我們要的形狀。** Better Auth **不碰資料庫**，它只吐 TypeScript schema 檔；我們把那份檔案當作自己 schema 的一部分（或抄進去），migration 完全由 `drizzle-kit` 產生，進入我們的 migration 鏈，沒有第二套 migration 系統。

**升版導致 schema 變更的處理流程**（推導自上述機制，形狀已驗證，實際痛感未驗證）：

1. 升 `better-auth` 版本
2. 重跑 `npx auth@latest generate` → 輸出到暫存檔
3. **diff** 對照我們現有的 schema
4. 人工把差異併進我們的 schema 檔（保留我們自己加的欄位與命名映射）
5. `drizzle-kit generate` → 產生一個正常的 migration，`drizzle-kit migrate` 套用

第 4 步是人工的，也**應該**是人工的 —— 這正是「schema 主權在我們」的代價與好處。實例：1.7.0（2026-08-18）把 `account` 的唯一鍵改成 `(issuer, accountId)`，那就是一次需要人工判斷的 schema 變更。

**命名映射（讓 Better Auth 的表名／欄名符合我們的慣例）：已驗證。**

```ts
export const auth = betterAuth({
  user: {
    modelName: "users",
    fields: { name: "full_name", email: "email_address" },
  },
  session: {
    modelName: "user_sessions",
    fields: { userId: "user_id" },
  },
});
```

型別推導不受影響（程式碼仍寫 `user.name`）。Drizzle adapter 額外提供 `usePlural` 旗標一次套用複數表名。
⚠️ **注意**：Drizzle adapter 要求「你定義的 schema 表名要和 Better Auth 認知的一致」，所以改名時 **schema 物件與 auth 設定兩邊都要改**，否則會 runtime 找不到表。

**擴充 core schema：已驗證。** `user.additionalFields` 可加欄位（`type` / `required` / `defaultValue` / `input` / `returned`）。`input: false` 表示不接受 API 傳入 —— 對「server-owned 欄位」很重要。

> **但這裡有一個 coupling 決策要在階段 3.5 做**：我們 domain 自己的 `users` 欄位（例如顯示名稱偏好、locale）要走 `additionalFields`（讓 Better Auth 知道它們存在、能讀能寫），還是直接寫在我們的 Drizzle schema 裡不告訴 Better Auth（Better Auth 只 select 它認得的欄位）？後者耦合較低，但欄位若有 `NOT NULL` 且無 default，Better Auth 的 insert 會失敗。**建議：domain 欄位一律 nullable 或帶 DB default，不進 `additionalFields`。**（未驗證，需 spike。）

### Auth.js v5 的對照

- 沒有 code generator。schema 是**文件裡的一段可複製程式碼**（`@auth/drizzle-adapter` 的 `pg.ts` 就是範本），你自己貼進專案。
- migration 同樣完全由 `drizzle-kit` 負責。
- 升版 schema 變更 → 手動比對 adapter 原始碼。因為 v5 已進入維護模式（見第 4 條），schema 變動風險反而**低於** Better Auth。
- 適配器可接受自訂表：`DrizzleAdapter(db, { usersTable, accountsTable, ... })`。

→ **兩者在這一項上差不多，Better Auth 因為有 `generate` 而稍佔優（升版時有可 diff 的權威輸出）。已驗證。**

---

## 3. Session model

### Better Auth

**預設是 DB session（不是 JWT）。已驗證。**

> 「the session is stored in a cookie and is sent to the server on every request」；`session_token` 是 「the server-side session identifier」
> session 表欄位：`id`、`token`、`userId`、`expiresAt`、`ipAddress`、`userAgent`
> — <https://www.better-auth.com/docs/concepts/session-management>（2026-09-01 查證）

- 預設有效期 **7 天**（`expiresIn`），達 `updateAge`（預設 1 天）時自動續期。可 `disableSessionRefresh: true` 關閉，或 `deferSessionRefresh: true` 延後（給 read replica 用）。
- **Stateless mode**：完全不設定 database 時自動啟用，session 存在簽章／加密 cookie 內，靠簽章驗證而非查 DB。**我們有 DB，所以不走這條。**
- **Secondary storage**（Redis 等）可選；有 secondary storage 時預設存那裡，可用 `storeSessionInDatabase: true` 覆寫。

**Cookie cache：這是回答部署問題的關鍵機制。已驗證。**

把 session 資料放進一個短命的簽章 cookie，減少 DB 往返。三種編碼：

| strategy | 說明 |
|---|---|
| `compact` | Base64url + HMAC-SHA256（最小、最快） |
| `jwt` | 標準 JWT（可讀、可互通） |
| `jwe` | A256CBC-HS512 全加密（最安全、最大） |

```ts
session: {
  cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "compact" }
}
```

**Next.js middleware 的三條路。已驗證。**（<https://www.better-auth.com/docs/integrations/next>，2026-09-01）

| 方法 | 驗證強度 | runtime 需求 | DB 往返 |
|---|---|---|---|
| `getSessionCookie()` | **只檢查 cookie 存在**。文件明說「lacks validation and is unsafe as your sole protection mechanism」，只適合 optimistic redirect | Edge OK | 無 |
| `getCookieCache()` | 從 cookie cache 讀出**已簽章驗證**的 session 物件 | Edge OK | 無 |
| `auth.api.getSession()` | 完整驗證（含查 DB） | **需 Node.js runtime** | 有 |

**Next.js 版本相關（已驗證，重要）：**

- **Next.js 16+**：middleware 改名為 proxy —— 「Rename `middleware.ts` → `proxy.ts` and `middleware` → `proxy` function.」
- **Next.js 15.2.0+**：middleware 支援 Node.js runtime（16 之前為 experimental）。設定：
  ```ts
  export const config = { runtime: "nodejs", matcher: ["/dashboard"] };
  ```
- **15.2.0 之前**：middleware 只有 Edge Runtime，**不能查 DB**。

**Server Action 要 `nextCookies()` plugin**（放在 plugins 陣列最後），否則 `Set-Cookie` 不會生效。已驗證。

**建議形狀（給 Scenephonie）**：DB session + `cookieCache: { enabled: true, strategy: "compact", maxAge: 5min }`。middleware 只做 optimistic redirect（`getCookieCache` 或 `getSessionCookie`），**真正的授權判斷放在 page / route handler 的 application layer gate**（這也正是 ADR-0011 想要的位置 —— middleware 不是授權的家）。

### Auth.js v5

**預設是 JWT session；只有配置了 database adapter 時才切成 database strategy。已驗證。**

> 「This is the default session strategy for Auth.js unless a database provider is configured.」
> — <https://authjs.dev/concepts/session-strategies>（2026-09-01 查證）

**Edge 相容性是 v5 的結構性痛點。已驗證。**

> 「Raw TCP sockets are one of those Node.js features that are generally not available to edge runtimes.」
> 「Database session strategies cannot be used in middleware because middleware code always runs in an edge runtime.」
> — <https://authjs.dev/guides/edge-compatibility>（2026-09-01 查證）

官方解法是 **split config**：拆成 `auth.config.ts`（只有 providers，無 adapter）＋ `auth.ts`（完整，含 adapter，server 用）＋ `proxy.ts`（用 base config，跑在 edge）。並建議 edge 環境使用 **JWT strategy**。

→ **這是 Auth.js v5 的一個實質缺點**：它把「middleware 只能跑 edge」當成不可變前提，於是逼你為了 middleware 而拆設定、或改用 JWT。Better Auth 因為擁抱 Next 15.2+ 的 Node runtime middleware 且提供 cookie cache，**不需要拆設定，也不需要放棄 DB session**。

---

## 4. 成熟度

### Better Auth（已驗證，全部來自 GitHub API / npm registry / 官方 blog，2026-09-01 查證）

| 項目 | 數據 | 來源 |
|---|---|---|
| npm `latest` | **1.7.2** | <https://registry.npmjs.org/better-auth> |
| 1.7.2 發布 | 2026-08-26 | GitHub releases API |
| **1.0.0 發布** | **2024-11-23** | `api.github.com/.../releases/tags/v1.0.0` |
| repo 建立 | 2024-05-19 | GitHub API |
| Stars | **29,785** | GitHub API |
| Open issues | **708** | GitHub API |
| 最後 push | **2026-09-01**（今天） | GitHub API |
| Forks | 2,864 | GitHub API |
| License | **MIT** | GitHub API |
| Weekly downloads | ~4.7M（2026-07 官方數字） | Vercel / Better Auth 收購公告 |
| 貢獻者 | 850+ | 同上 |

**已 1.0，距今 21 個月。** 發布節奏是**每週數次 patch**（1.6.27→1.6.30 全在 2026-08-11～08-17）。

**Breaking-change 歷史（已驗證）：**

`1.7.0`（**2026-08-18**，兩週前）帶著一整批 breaking changes：

- Database joins 從 experimental 轉為 stable API
- **Account identity 改為以 trusted issuer 劃分，account 主鍵改為 `(issuer, accountId)`** ← 這是會動到 schema 的
- Captcha endpoints 改為需要完整 path 比對（wildcard）
- MCP plugin 拆成獨立套件 `@better-auth/mcp`
- OIDC back-channel logout
- OAuth protected resources 顯式建模
- **SCIM 從 organization plugin 解耦**
- OTP-only two-factor，回應改為 discriminated union
- Generic OAuth 重寫為 first-class social provider
- Device grant 拆為 `oauthDeviceAuthorization()`

`0.x → 1.0` 之間的完整 breaking-change 史：**未驗證**（changelog 頁面未列 1.0 之前的細節）。但對我們無意義 —— 我們從 1.7.x 開工。

> **這一條要誠實看待**：一個 1.x 的 minor 版就帶十項 breaking change，代表「1.0」在這個專案裡不是 semver 意義上的穩定承諾，比較接近「功能完整度里程碑」。**因應：`package.json` 鎖 `~1.7.x`（只收 patch），升 minor 視為一次有 review 成本的任務。**

**維護者與資金（已驗證）：**

- 創辦人 Bereket Engida（`@bekacru`，CEO）與 KinfeMichael Tariku
- 2025-06-25 完成 **$5M seed**，Peak XV Partners 領投，Y Combinator / Chapter One / P1 Ventures 參與（<https://better-auth.com/blog/seed-round>）
- **2026-07-07 被 Vercel 收購**，核心團隊加入 Vercel（<https://better-auth.com/blog/better-auth-joins-vercel>、<https://vercel.com/blog/vercel-acquires-better-auth>）
  - 官方說法：「Vercel shares our commitment to keeping auth open source, framework and platform agnostic」，維持 MIT，維持 framework-agnostic
  - 新方向：Agent Auth Protocol（agent identity）

**收購的雙面性（判斷，非事實）**：正面是資金與人力有保障、不會突然停止維護；風險是（a）產品重心可能偏向 Vercel 平台與 agent identity 而非我們這種自架 Postgres 的用例；（b）「framework and platform agnostic」是承諾不是保證。緩解：MIT + 我們擁有 schema + ADR-0011 已把 domain 與 library 隔開 → **抽換成本被刻意壓低了**。這正是 ADR-0011 存在的理由。

**實際採用案例**：4.7M weekly downloads 是最硬的數字（一手，官方公告）。具名企業採用案例**未驗證** —— 搜尋到的只有 boilerplate（Supastarter、Makerkit）等二手來源。

### Auth.js v5（已驗證）

| 項目 | 數據 |
|---|---|
| npm `latest` | **4.24.15**（仍是 v4！） |
| npm `beta` | **5.0.0-beta.32** |
| v5 是否已發布正式版 | **否。到 2026-09-01 仍是 beta。** |
| Stars | 28,355 |
| Open issues | 600 |
| 最後 push | **2026-07-22** |
| Archived | 否 |

**決定性的事實（已驗證）：**

> 2025-09-26 官方公告：「Auth.js (formerly NextAuth.js) will now be maintained by the Better Auth team.」
> 進入維護模式：「maintenance will continue for security and urgent issues.」
> v5 出 beta：「no immediate plans for v5」
> 對新專案的建議：「If you're starting something new (or planning a refresh), we recommend Better Auth as the best way forward.」
> 理由：「maintainers moved roles, time was tight, and the surface area outgrew what we could responsibly support」
> — <https://github.com/nextauthjs/next-auth/discussions/13252>（2026-09-01 查證）

2026-02-18 社群仍在問「還要 beta 幾年」（[discussion #13382](https://github.com/nextauthjs/next-auth/discussions/13382)），**該討論串至今標記為 Unanswered，無維護者回應。**

安全維護是有的：2026-07 修了四個 advisory（`@auth/core` 0.41.3、`next-auth` 4.24.15 / 5.0.0-beta.32），包含 homoglyph `@` 繞過 email 驗證（High）、`getToken` 對畸形 header crash（High）、OAuth state cookie 未綁定 provider（Medium）、provider 設定錯誤時驗證預設成功（Low，v5 only）。由 Better Auth 團隊的 security workstream 執行。（<https://better-auth.com/blog/security-update-july-2026>，2026-09-01 查證）

→ **Auth.js v5 是一個由競品團隊維持生命跡象、且該團隊公開建議新專案不要用的 beta。作為「保守對照」它已經不保守了。**

---

## 5. 擴充成本（Better Auth）

### (a) Google OAuth：**低。已驗證。**

```ts
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
})
```

外加 Google Cloud Console 建 OAuth client ID（Web application），redirect URI：
`http://localhost:3000/api/auth/callback/google` / `https://<domain>/api/auth/callback/google`。

客戶端：`authClient.signIn.social({ provider: "google" })`。

文件特別警告：**production 一定要設 `baseURL`**，否則 redirect URI mismatch。
（<https://www.better-auth.com/docs/authentication/google>，2026-09-01 查證）

**無額外 schema。** provider identity（Google `sub`）落在 `account` 表的 `accountId`；`providerId` 記 provider、`issuer` 記命名空間，`(issuer, accountId)` 為唯一複合索引（1.7.0 起）。**這正是 ADR-0011 §① 想要的隔離位置 —— domain 永不讀 `account`。**（<https://www.better-auth.com/docs/concepts/users-accounts>，2026-09-01）

### (b) 日後加 magic link：**低。部分驗證。**

```ts
import { magicLink } from "better-auth/plugins";
plugins: [ magicLink({ sendMagicLink: async ({ email, token, url, metadata }, ctx) => { /* 寄信 */ } }) ]
```
客戶端 `magicLinkClient()`；流程 `signIn.magicLink({ email })` → callback 寄信 → `GET /magic-link/verify` → 建 session。token 預設 300 秒過期。預設會自動註冊新使用者（`disableSignUp: true` 可關）。

**Schema：官方 plugin 文件未列出任何 schema 變更**，推測沿用既有 `verification` 表（該表本就是 `identifier` / `value` / `expiresAt` 的通用結構）。**未驗證 —— 加上去之前要跑一次 `auth generate` 看 diff。**

**真正的成本不在 library，在寄信基礎設施**（transactional email provider、DKIM/SPF、送達率）。票券 24 把 magic link 排除在 v1 之外是對的，且**這個決定不會因為 library 而改變**。

### (c) organization / members plugin：**形狀清楚，但這是 ADR-0011 的警戒區。已驗證。**

**它產生的表**（<https://www.better-auth.com/docs/plugins/organization>，2026-09-01 查證）：

| 表 | 欄位 |
|---|---|
| `organization` | `id`, `name`, `slug`, `logo`, `metadata`, `createdAt`, `updatedAt` |
| `member` | `id`, `organizationId`, `userId`, `role`, `createdAt` |
| `invitation` | `id`, `organizationId`, `email`, `role`, `inviterId`, `expiresAt`, `createdAt` |
| `session`（既有表加欄位） | ＋`activeOrganizationId`, ＋`activeTeamId` |
| `organizationRole`（選用，dynamic AC） | `id`, `organizationId`, `role`, `permissions`, `createdAt` |
| `team` / `teamMember`（選用） | 子群組與其成員 |

**它是否侵入我們的 domain authorization：會，如果我們讓它侵入。**

plugin 自帶完整 RBAC：
- 預設角色 `owner` / `admin` / `member`
- permission 是 resource-action 對：「organization: `update` `delete`；member: `create` `update` `delete`；invitation: `create` `cancel`」
- `createAccessControl` 定義自訂 resource/action，`hasPermission` API 做 runtime 檢查
- before hook 丟 error 可阻止操作

文件本身的描述是：**「The organization plugin enforces all role-based access control checks before allowing operations」** —— 也就是說，**授權判斷住在 plugin 裡**。

> **⚠️ 這正是 ADR-0011 不變式 H 明確否決的第一個選項**（「授權由 auth library / middleware 負責 —— 否決。它把 infrastructure 抬成領域真理來源」）。
>
> **採用建議（本報告的立場，待 ADR 確認）**：
> 1. 日後若要協作，**只採用 `organization` / `member` / `invitation` 三張表作為資料**，把 `member.role` 當成一個**領域事實**讀進我們的 authorization gate。
> 2. **不使用** `createAccessControl` / `hasPermission` / `organizationRole` 的 dynamic AC —— 這三者是平行真理來源。
> 3. **不使用** `session.activeOrganizationId` 作為授權依據。它是 UI 狀態（文件本身也說「applications may manage active organization client-side only」），不是權限。授權主體必須從 request 的 project 參數推導，不能從 session 的「目前選中」推導 —— 否則使用者換 tab 就換權限。
> 4. 更保守也更誠實的替代方案：**根本不用 organization plugin，自己建三張表**。它們是七個欄位的普通關聯表，plugin 帶來的是 API endpoint 與邀請流程，不是資料模型的難度。用不用它是**便利性**取捨，不是能力取捨 —— 這在架構上讓「約束 3（不得堵死協作）」保持開放，且完全不引入 ADR-0011 禁止的耦合。

**ADR-0011 §④ 說 `ownerId` 是最小掛點、未來在它之上加東西。organization plugin 的 `member` 表就是那個「之上」的自然形狀（`member(organizationId, userId, role)` → 我們的版本可能是 `project_members(projectId, userId, role)`）。它證明擴充路徑存在，我們不必現在採用它。**

### (d) 不經 OAuth provider 建立 session（訪客入口）：**能。已驗證。**

**`anonymous` plugin**（<https://www.better-auth.com/docs/plugins/anonymous>，2026-09-01 查證）：

- 目的：讓使用者「without requiring them to provide an email address, password, OAuth provider, or any other Personally Identifiable Information (PII)」就能有 session
- **Schema：只在 `user` 表加一個 boolean 欄位 `isAnonymous`**
- 建立：`signIn.anonymous()` —— 產生臨時 email（預設 `{id}@anonymous.placeholder.invalid`，可用 `emailDomainName` 改）與預設名稱，直接建 session
- **升級路徑**：日後以其他方式（Google）登入時，觸發 `onLinkAccount({ anonymousUser, newUser })` callback，可在其中搬移資料

> **⚠️ 一個會咬人的預設值（已驗證，且直接影響我們）：**
> **`onLinkAccount` 執行後，anonymous user record 預設會被刪除**（除非設 `disableDeleteAnonymousUser: true`）。
>
> Scenephonie 的訪客入口是「ephemeral user ＋ clone demo project」（票券 24），也就是 **`projects.owner_id` 會指向那個 anonymous user 的 `usr_...`**。若該 row 被刪除：
> - 有 FK constraint → 刪除失敗，link 流程炸掉
> - FK 是 `ON DELETE CASCADE` → **訪客的專案跟著被刪**，正是我們最不能發生的事
>
> **因應（兩條，擇一，需在階段 3.5 定案）**：
> (A) 設 `disableDeleteAnonymousUser: true`，並在 `onLinkAccount` 內把 `projects.owner_id` 從 `anonymousUser.id` 改指到 `newUser.id`，之後自行清理 anonymous row；或
> (B) 不用 anonymous plugin 的刪除語意，讓 anonymous user **就是**那個 user —— link 時把 Google account 掛到既有的 anonymous user 上、只把 `isAnonymous` 翻成 false。這與 ADR-0011 §③「所有 authentication entry point 收斂進同一條 pipeline、domain 不知道誰是訪客」最一致，因為 `UserId` 從頭到尾沒變過。
>
> **(B) 是與 ADR-0011 一致的方向**，但 plugin 是否支援「就地升級而非建新 user」**未驗證** —— 這是本報告最需要 spike 的第二項。

### Auth.js v5 對照（第 5 條）

- **(a) Google OAuth**：同樣簡單（`providers: [Google]`），成本相當。已驗證（v5 官方 provider 文件形狀）。
- **(b) magic link**：v5 用 `Email` provider（nodemailer / Resend adapter），需要 `verificationTokens` 表 —— 該表在 Drizzle adapter 的預設 schema 裡本來就有。成本相當。部分驗證。
- **(c) organization / members**：**Auth.js 沒有這個東西，完全自建。** 這在 ADR-0011 的視角下弔詭地是**優點**（不會有平行授權真理來源的誘惑），但也代表協作路徑上零幫助。已驗證（v5 無官方 organization/RBAC plugin）。
- **(d) 不經 provider 建 session**：**沒有第一方 anonymous 支援。** 常見做法是自訂 `Credentials` provider 直接發 JWT（`Credentials` 在 v5 中只支援 JWT strategy，不能配 database session —— 這是官方限制）。這對「訪客也要有真正的 DB user 與 owned project」的需求是**不好的形狀**：要嘛訪客走 JWT session、其他人走 DB session（兩套 session model），要嘛自己繞過 Auth.js 建 user。**部分驗證** —— Credentials+database session 的限制來自 v5 文件的長期已知行為，未於今日逐字複查。

---

## 6. Auth.js v5 逐項對照總表

| # | 項目 | Better Auth 1.7.2 | Auth.js 5.0.0-beta.32 | 勝方 |
|---|---|---|---|---|
| 1 | 自訂 `user.id`（`usr_`+nanoid） | ✅ `advanced.database.generateId` 函式，per-model；pg 下 `text` pk，FK 自動跟隨 | ✅ 改 Drizzle schema 的 `$defaultFn`；但 account/session/verification 主鍵形狀不對稱 | **Better Auth**（規則的家在 auth 設定，且全表一致） |
| 2 | Drizzle + pg 整合 / schema 主權 | `auth generate` 產 schema 檔；`migrate` 不支援 Drizzle → migration 走 drizzle-kit；`modelName`/`fields`/`usePlural` 可改名 | 無 generator，schema 從文件複製；migration 同樣走 drizzle-kit；adapter 接受自訂表 | **Better Auth**（升版有可 diff 的權威輸出） |
| 3 | Session model | 預設 DB session；cookie cache（compact/jwt/jwe）避免往返；Next 15.2+ Node runtime middleware 可完整驗證 | 預設 JWT；有 adapter 才 database；**DB session 不能在 middleware 用**，官方要求 split config，edge 建議用 JWT | **Better Auth**（不必為 middleware 犧牲 DB session） |
| 4 | 成熟度 | 1.0 於 2024-11；latest 1.7.2（2026-08-26）；29.8k★；每週發版；1.7.0 十項 breaking；MIT；$5M seed → 2026-07 被 Vercel 收購 | **v5 仍 beta（beta.32）**；latest tag 仍是 v4；28.4k★；**2025-09 起由 Better Auth 團隊維護、進入維護模式**；官方建議新專案用 Better Auth | **Better Auth**（對照組已被自己的維護者勸退） |
| 5a | Google OAuth | 一段 config | 一段 config | 平手 |
| 5b | magic link | `magicLink()` plugin，成本在寄信基礎設施 | `Email` provider，成本同 | 平手 |
| 5c | organization/members | 有 plugin（6+ 張表）＋**自帶 RBAC（ADR-0011 警戒）** | 無，全自建 | **取決於紀律**（見下節） |
| 5d | 免 provider 建 session | ✅ `anonymous` plugin（`isAnonymous` 欄位、`signIn.anonymous()`、`onLinkAccount`） | ❌ 無第一方支援；Credentials provider 綁 JWT strategy | **Better Auth** |

---

## 對 domain model 的衝擊

### 會不會逼我們改 `users` / `projects.owner_id`？

**不會。**

- `users.id`：`usr_` + nanoid 可原封不動（第 1 條已驗證）。Better Auth 的 user model 用 `user.modelName: "users"` 對到我們的表名。
- `projects.owner_id`：完全不受影響。它是我們自己的欄位、指向我們自己的 `users.id`，Better Auth 從不知道 `projects` 存在。
- identity chain **`Scenephonie UserId → users.id → projects.owner_id` 成立**，ADR-0011 §① 的「infrastructure 不應迫使 domain identity 改變」不被違反。
- **票券 24 §4 的「一張表」裁決維持**，shadow table 不需要。

**唯一新增的表是 Better Auth 的 `session` / `account` / `verification`**，它們指向 `users.id`。ADR-0011 §① 說「domain 永不讀 `account`」—— 這條規則在此架構下**可用 grep 驗證**（domain 層原始碼不得出現 `account` 表的 import），成立。

**一個要注意的耦合方向**：`session.userId` / `account.userId` 對 `users.id` 有 FK。這代表**刪除 domain user 時要處理 auth 表**（cascade 或先清）。這是正常代價，不是架構問題。

### 是否動搖 ADR-0011 不變式 H？

**現在不動搖；但有一條必須寫下來的守則。**

不變式 H：*Authentication identity 不直接授予 domain authority；domain write operations 必須以已授權的 project context 進入 command pipeline。*

- **v1（Google OAuth + 訪客）：完全不動搖。** Better Auth 只給 `session → userId`。我們的 application layer gate 拿 `userId` 去查 `projects.owner_id`，產出 authorized project handle，command 只吃 handle。Better Auth 對這條路徑沒有任何發言權。
- **警戒點：`organization` plugin 的 access control。** 它是一個**現成的、方便的、會侵入的**授權真理來源。ADR-0011 的〈Considered Options〉已明文否決這個選項；plugin 的存在不改變那個裁決，只是把誘惑放到手邊。

> **建議加進 ADR-0011 的後果條，或作為一條新的 ADR：**
>
> **採用任何 auth library plugin 時，只採用其資料模型，不採用其授權判斷。** 具體禁止清單：`createAccessControl`、`hasPermission`、`organizationRole` 表的 dynamic AC、以 `session.activeOrganizationId` 作為授權依據。授權判斷一律回到 application layer gate。
>
> 這條規則之所以值得寫死，是因為它**同樣可以 grep**（禁止 import `hasPermission` 等符號），與 §① 的「domain 永不讀 `account`」是同一種可驗證的邊界，而不是靠慣例維持的東西 —— ADR-0011 自己說過：「靠慣例維持的東西會說謊」。

### 訪客入口對 domain model 的具體影響（新發現，需決策）

見第 5(d) 條：`anonymous` plugin 預設會在 link 時**刪除 anonymous user row**。因為 `projects.owner_id` 指向它，這會與我們的 domain model 直接衝突。兩條解法（就地升級 vs. 搬移 owner_id）中，**就地升級（保留同一個 `UserId`）與 ADR-0011 §③「所有 authentication entry point 收斂進同一條 pipeline、domain 不知道誰是訪客」最一致**，應優先驗證其可行性。

---

## 回饋給票券 25（部署）

**Session model 的裁決是：DB session（存在我們的 Postgres）＋ cookie cache。** 由此推出的部署約束：

### 硬約束

1. **應用 runtime 必須能對 Postgres 開 TCP 連線。**
   Better Auth 的 session 驗證（`auth.api.getSession()`）要查 DB。純 Edge runtime 沒有 raw TCP socket（Auth.js 文件對此的陳述同樣適用：「Raw TCP sockets are one of those Node.js features that are generally not available to edge runtimes」）。
   → **排除「整個 app 跑在 Edge runtime」的部署形態**，除非改用 HTTP-based 的 Postgres driver（如 Neon serverless driver）。若票券 25 想保留 Edge 選項，**該 driver 的選擇就變成 blocking 決策**。

2. **若要在 middleware 做完整 session 驗證，需要 Next.js ≥ 15.2.0 並在 middleware 設 `runtime: "nodejs"`；Next.js 16+ 則檔名為 `proxy.ts`、函式名為 `proxy`。**
   → 票券 25 的 Next.js 版本選擇與部署平台對 Node runtime middleware 的支援度綁在一起（Vercel 支援；自架 Node server 天然支援；某些 edge-only 平台不支援）。

3. **Server Action 需要 `nextCookies()` plugin**（放 plugins 陣列最後），否則 `Set-Cookie` 不生效。與部署平台無關，但屬同一組整合事實。

### 建議形狀（降低部署耦合）

**middleware 不做完整驗證。** 只用 `getCookieCache()`（讀已簽章驗證的 cookie cache，無 DB 往返、Edge 可跑）做 optimistic redirect；真正的授權在 page / route handler 的 application layer gate 完成（那也是 ADR-0011 指定的位置）。

**這條建議的效果是：middleware 層對部署形態幾乎沒有要求，把 runtime 約束收斂到「跑 route handler 的地方要連得到 Postgres」這一條。** 票券 25 因此可以在「長駐 Node server」與「serverless Node function」之間自由選，只有「edge-only」被排除。

### 每次請求的成本

| 情境 | DB 往返 |
|---|---|
| middleware optimistic check（`getCookieCache`） | 0 |
| page/route 內完整驗證，cookie cache 命中（≤ `maxAge`，建議 5 分鐘） | 0（session）＋ 我們自己的 ownership 查詢 |
| cookie cache 過期 | 1（session）＋ ownership 查詢 |
| session 達 `updateAge`（預設 1 天） | ＋1 write |

→ **serverless 冷啟 + 每請求一次 DB 連線的成本，主要落在我們自己的 ownership 查詢上，而不是 auth。** cookie cache 讓 auth 幾乎不貢獻額外往返。這是選 Better Auth 而非 Auth.js（後者為了 middleware 逼你改 JWT）的實質收益之一。

**若日後需要跨區低延遲**：Better Auth 支援 secondary storage（Redis）放 session，以及 `deferSessionRefresh: true` 給 read replica 用。**這兩者都是 v1 之後的優化，不進 v1 的部署決策。**

---

## 風險與未知

### 必須 spike 才能定案（優先序）

1. **【高】自訂 `generateId` 的實際行為。**
   最小專案：`better-auth@1.7.2` + `drizzleAdapter(db, { provider: "pg" })` + `generateId: ({ model }) => \`${prefixOf(model)}_${nanoid()}\``。
   驗什麼：`user.id` 是否真的是 `usr_...`；`session.userId` / `account.userId` 是否正確；`options.model` 傳進來的**確切字串**（是 `"user"` 還是我們改名後的 `"users"`？—— 文件的範例同時檢查 `"user"` 和 `"users"`，暗示這裡有歧義）。
   為什麼：這是 blocking criterion，且此區域有 bug 歷史（#2275 / #3172 / #1060 / #6447 / PR #9068）。文件層級已驗證，行為層級未驗證。

2. **【高】anonymous → Google 的 link 路徑對 `projects.owner_id` 的影響。**
   驗什麼：`onLinkAccount` 觸發時 anonymous user row 是否真被刪；`disableDeleteAnonymousUser: true` 後的實際流程；**能否「就地升級」（把 Google account 掛到既有 anonymous user 上、保持同一個 `usr_...`）而不建新 user**。
   為什麼：這決定訪客的 demo project 會不會在登入時消失，也決定 ADR-0011 §③ 的「同一條 pipeline」能不能字面成立。

3. **【中】`additionalFields` vs. 「schema 裡自己加欄位」的取捨。**
   驗什麼：不宣告在 `additionalFields` 的欄位，Better Auth 的 user insert 會不會失敗（若欄位 `NOT NULL` 無 default）；Better Auth 的 select 是否會因為多餘欄位出錯。
   為什麼：決定我們的 domain 欄位要不要進 auth 設定檔 —— 這是一條耦合方向。

4. **【中】Next.js 版本與 middleware runtime 的實測。**
   驗什麼：目標 Next.js 版本（15.2+ 或 16）下 `runtime: "nodejs"` middleware / `proxy.ts` 是否如文件所述可查 DB；`getCookieCache` 在 Edge 的行為。
   為什麼：直接影響票券 25。

5. **【低】magic link plugin 的 schema 變更。**
   驗什麼：加上 plugin 後 `auth generate` 的 diff。
   為什麼：v1 不做，但要知道代價（目前是推測沿用 `verification` 表）。

### 查不到 / 未驗證的事

- **Better Auth 具名企業採用案例。** 只有 4.7M weekly downloads 與 850+ contributors（一手，官方）；具名 production 用戶只找到 boilerplate（Supastarter / Makerkit）等**二手來源**，未採信。
- **`0.x → 1.0` 的完整 breaking-change 史。** changelog 頁面未涵蓋。對我們無實務影響（從 1.7.x 開工）。
- **Better Auth 核心的 `generateId` 解析原始碼。** 嘗試讀取 `packages/better-auth/src/db/*` 與 `adapters/create-adapter/*` 的 raw 檔案均 404（路徑推測錯誤，且未帶認證的 GitHub code search API 回 401）。**第 1 條的原始碼證據來自 CLI generator（`packages/cli/src/generators/drizzle.ts`，成功讀取），核心解析邏輯為文件層級驗證。**
- **Auth.js v5 的 Credentials provider 是否仍禁止 database session strategy。** 屬長期已知行為，今日未逐字複查 → 標記為部分驗證。此點只影響已被淘汰的對照組，不影響 verdict。
- **Vercel 收購後的長期路線。** 官方承諾維持 MIT、framework-agnostic，但那是承諾。ADR-0011 已把抽換成本壓低，這是唯一的實質對沖。

### 需要在 ADR 層面決定的事（超出本票，建議開票）

- 「**只用 plugin 的資料模型，不用它的授權判斷**」是否要成為一條可 grep 的成文規則（見〈對 domain model 的衝擊〉）。
- `better-auth` 的版本鎖定政策（建議 `~1.7.x`，minor 升版視為一次有 review 成本的任務）。

---

## 來源清單（全部於 2026-09-01 查證）

**Better Auth 官方文件**
- Options reference（`advanced.database.generateId` 簽名）— <https://www.better-auth.com/docs/reference/options>
- Database concepts（ID generation、core schema、CLI、modelName/fields、additionalFields）— <https://www.better-auth.com/docs/concepts/database>
- Drizzle adapter — <https://www.better-auth.com/docs/adapters/drizzle>
- Session management（DB session、cookie cache、expiresIn/updateAge、secondary storage）— <https://www.better-auth.com/docs/concepts/session-management>
- Next.js integration（proxy.ts、Node runtime middleware、getSessionCookie / getCookieCache、nextCookies）— <https://www.better-auth.com/docs/integrations/next>
- Google provider — <https://www.better-auth.com/docs/authentication/google>
- Users & accounts（`providerId` / `accountId` / `issuer`、trustedProviders）— <https://www.better-auth.com/docs/concepts/users-accounts>
- Anonymous plugin — <https://www.better-auth.com/docs/plugins/anonymous>（另讀 raw mdx：<https://raw.githubusercontent.com/better-auth/better-auth/main/docs/content/docs/plugins/anonymous.mdx>）
- Organization plugin — <https://www.better-auth.com/docs/plugins/organization>
- Magic link plugin — <https://www.better-auth.com/docs/plugins/magic-link>
- Changelog — <https://better-auth.com/changelog>

**原始碼**
- Drizzle schema generator（id / FK 欄位型別）— <https://raw.githubusercontent.com/better-auth/better-auth/main/packages/cli/src/generators/drizzle.ts>
- Auth.js Drizzle pg schema — <https://raw.githubusercontent.com/nextauthjs/next-auth/main/packages/adapter-drizzle/src/lib/pg.ts>

**registry / API 數據**
- npm `better-auth`（dist-tags、latest 1.7.2）— <https://registry.npmjs.org/better-auth>
- npm `auth`（CLI 套件）— <https://registry.npmjs.org/auth>
- npm `next-auth`（dist-tags：latest 4.24.15、beta 5.0.0-beta.32）— <https://registry.npmjs.org/next-auth>
- GitHub repo better-auth/better-auth（29,785★ / 708 issues / pushed 2026-09-01 / MIT）— <https://api.github.com/repos/better-auth/better-auth>
- GitHub releases（1.7.0 breaking changes、1.7.2 於 2026-08-26）— <https://api.github.com/repos/better-auth/better-auth/releases>
- GitHub v1.0.0 release（2024-11-23）— <https://api.github.com/repos/better-auth/better-auth/releases/tags/v1.0.0>
- GitHub repo nextauthjs/next-auth（28,355★ / 600 issues / pushed 2026-07-22）— <https://api.github.com/repos/nextauthjs/next-auth>

**公告與狀態**
- 「Auth.js is now part of Better Auth」（2025-09-26，維護模式、推薦新專案用 Better Auth）— <https://github.com/nextauthjs/next-auth/discussions/13252>
- 「How many more years of beta releases for v5?」（2026-02-18，至今 Unanswered）— <https://github.com/nextauthjs/next-auth/discussions/13382>
- Auth.js security update July 2026 — <https://better-auth.com/blog/security-update-july-2026>
- Better Auth $5M seed（2025-06-25）— <https://better-auth.com/blog/seed-round>
- Better Auth joins Vercel（2026-07-07）— <https://better-auth.com/blog/better-auth-joins-vercel>、<https://vercel.com/blog/vercel-acquires-better-auth>

**ID generation 相關 issue（風險佐證）**
- <https://github.com/better-auth/better-auth/issues/2275>
- <https://github.com/better-auth/better-auth/issues/3172>
- <https://github.com/better-auth/better-auth/issues/1060>
- <https://github.com/better-auth/better-auth/issues/6447>
- <https://github.com/better-auth/better-auth/issues/5081>
- <https://github.com/better-auth/better-auth/pull/9068>

**二手來源（僅供背景，結論未採信）**
- Vercel 收購的媒體報導（weetracker、Dealroom、Tekedia 等）—— 已由上述一手 blog 取代
- Better Auth 採用案例的 boilerplate 文章（Supastarter / Makerkit）—— 未採信為採用證據
