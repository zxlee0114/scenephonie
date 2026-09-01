# Better Auth 選型評估（對照 Auth.js v5）

Type: research
Status: resolved
Blocked by:

## Question

從[票券 24](./24-auth-and-project-owner.md) 畢業（2026-09-01）。24 已裁決**自架 auth library ＋ 自己的 Postgres**，並把 provider identity 隔離在 library 的 `account` 層（見 [ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)）。**Better Auth 是目前優先候選，但成熟度與整合細節未經驗證** —— 這張票就是去驗證它。

**這張票不重新裁決「自建 vs 第三方」**，那已定。它只回答「自架這條路上，哪一個 library，以及它會不會逼我們改 domain model」。

### Blocking acceptance criterion（先答這一條；答案為否就立刻回報，不必等其餘五條）

1. **`user.id` 的產生規則能不能由 Scenephonie 控制？** 具體是：`usr_` + nanoid 這種自訂格式的主鍵，能不能取代 library 的預設 id 格式，且 session／account／verification 等相關表的 FK 都跟著走。

   原則：**infrastructure 不應迫使 domain identity 改變。** 要確認的是這條 identity chain 能否成立：

   ```
   Scenephonie UserId → users.id → projects.owner_id
   ```

   **若不能成立**，才回頭評估 shadow table（library 自己的 `auth_user` ＋ 我們的 domain `users`，1:1），**而不是反過來為了 library 修改 domain model**。票券 24 §4 的「一張表」裁決屆時要重評。

### Architecture-critical

2. **Next.js App Router ＋ Drizzle ＋ PostgreSQL 整合現況**：schema 由誰擁有？migration 怎麼進我們的 Drizzle migration 鏈？library 升版時 schema 變更怎麼處理？
3. **Session model**：DB session vs JWT，以及對 Next.js middleware／Edge runtime／部署形態的影響。⚠️ **這一項要回頭餵給[票券 25](./25-deployment-and-hosting.md)。**

### Selection information

4. **成熟度**：版本、發布節奏、breaking-change history、實際採用面。
5. **擴充成本**：Google OAuth 現在、magic link 日後（票券 24 已裁決 magic link 不進 v1，但要知道加上去的代價）、以及 organization／members plugin 的形狀 —— 那是**約束 3（不得堵死協作）**的擴充路徑。
6. **Auth.js v5 在以上同樣五項的答案**，作為保守替代方案的對照。

### 不在這張票內

- **授權的責任邊界** —— [ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md) 已定（不變式 H）。無論選哪個 library，它都只提供 identity/session，**不得成為 domain authorization 的真理來源**。這張票的答案不得動搖那條邊界。
- **登入方式** —— 票券 24 已定：Google OAuth 進 v1、magic link 延後、密碼出局。
- **訪客體驗入口** —— 票券 24 已定形狀（ephemeral user ＋ clone demo project）。本票只需確認候選 library 能不能在**不經過 OAuth provider** 的情況下建立 session（訪客入口需要）。
- **部署平台** —— [票券 25](./25-deployment-and-hosting.md)。

### 它擋什麼

**擋階段 3.5 的實作，不擋開工。**[規格書](../spec.md) §13.2 的階段 0–3 不需要知道答案。

---

## Answer

**一句話：選 Better Auth（`~1.7.x`）—— blocking criterion 通過，票券 24 §4 的「一張表」維持；而 Auth.js v5 已不是有效的保守替代方案，因為它由 Better Auth 團隊接手並進入維護模式。**

完整研究報告（含每條結論的證據等級與 URL，2026-09-01 查證）：[`research/30-better-auth-evaluation.md`](../research/30-better-auth-evaluation.md)。

### 1. Blocking criterion：通過 —— `user.id` 由 Scenephonie 控制

`advanced.database.generateId` 接受一個**看得到 `model` 名稱**的自訂函式，所以能做 per-model prefix；官方文件自己就示範 per-model 分歧，這是設計意圖之內，不是鑽漏洞。Drizzle/pg 下 id 產生為 `text('id').primaryKey()`，且 CLI generator 原始碼有 `field.references?.field === 'id'` 分支，**指向 `id` 的 FK 自動跟隨主鍵策略**。

➡️ **identity chain `Scenephonie UserId → users.id → projects.owner_id` 成立。`usr_` + nanoid 原封不動。**
➡️ **shadow table 不需要，票券 24 §4 的「一張表」裁決維持，不必重評。**

⚠️ **證據等級：文件層級已驗證，行為層級未驗證。** 核心的 generateId 解析原始碼沒讀到（路徑推測 404），且這個區域有 bug 歷史（#2275／#3172／#1060／#6447／PR #9068 —— 都不落在「純自訂函式 + pg」這條路上，但足以要求實測）。**階段 3.5 開工的第一件事是一次 15 分鐘 spike**：驗 `user.id` 真的是 `usr_...`、`session.userId`／`account.userId` 跟著走、以及改名 `modelName: "users"` 之後 `options.model` 傳進來的**確切字串**（文件範例同時檢查 `"user"` 與 `"users"`，此處有歧義）。

**注意**：正確設定路徑是 `advanced.database.generateId`，頂層的 `advanced.generateId` 已 deprecated —— 不要照抄 2025 年的教學文。

### 2. Schema 主權在我們，migration 走我們自己的鏈

CLI（npm 套件名是 `auth`，不是舊名 `@better-auth/cli`）對 Drizzle **只做 `generate`**（吐 TypeScript schema 檔），`migrate` 僅支援內建 Kysely adapter。

➡️ **Better Auth 不碰資料庫。** 它產生 schema 檔，我們把它納入自己的 schema，migration 完全由 `drizzle-kit` 產生並進入我們的 migration 鏈。**沒有第二套 migration 系統。**

升版流程：升版 → 重跑 `auth generate` 到暫存檔 → diff → **人工**併進我們的 schema → `drizzle-kit generate/migrate`。第四步是人工的，也**應該**是人工的 —— 那正是「schema 主權在我們」的代價與好處。（實例：1.7.0 把 `account` 唯一鍵改成 `(issuer, accountId)`。）

表名／欄名可用 `user.modelName` / `fields` / Drizzle adapter 的 `usePlural` 映射到我們的慣例。⚠️ 改名時 **schema 物件與 auth 設定兩邊都要改**，否則 runtime 找不到表。

**傾向（待實作驗證）**：我們自己的 domain 欄位**不進 `additionalFields`**，直接寫在 Drizzle schema 裡，耦合較低；代價是這些欄位必須 nullable 或帶 DB default，否則 Better Auth 的 insert 會失敗。

### 3. Session model：DB session ＋ cookie cache

Better Auth **預設就是 DB session**（`session` 表 ＋ `session_token` cookie，預設 7 天、`updateAge` 1 天續期），另有 cookie cache 機制（`compact`／`jwt`／`jwe` 三種編碼）把 session 放進短命的簽章 cookie 以省去 DB 往返。

➡️ **裁決：DB session（存我們自己的 Postgres）＋ `cookieCache: { enabled: true, strategy: "compact", maxAge: 5min }`。**
➡️ **middleware 只做 optimistic redirect**（`getCookieCache()`，已簽章驗證、無 DB 往返、Edge 可跑）；**真正的授權判斷放在 page／route handler 的 application layer gate** —— 那正是 [ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md) 指定的位置。middleware 不是授權的家。

⚠️ `getSessionCookie()` 只檢查 cookie 存在，文件明說「unsafe as your sole protection mechanism」—— 不得單獨用作保護。
⚠️ Server Action 需要 `nextCookies()` plugin 放在 plugins 陣列**最後**，否則 `Set-Cookie` 不生效。

**這一項已回饋給[票券 25](./25-deployment-and-hosting.md)**（見該票 `## Comments`）。

### 4. 成熟度：夠成熟，但要當作「活躍」而非「穩定」來管

1.0 發布於 2024-11-23（距今 21 個月），`latest` 是 1.7.2（2026-08-26），每週數次 patch，29.8k★、MIT、2026-09-01 仍在 push。資金與人力有保障：2025-06 完成 $5M seed，**2026-07-07 被 Vercel 收購**，官方承諾維持 MIT 與 framework/platform agnostic。

**但 1.7.0（兩週前）一個 minor 版就帶十項 breaking change** —— 這代表「1.0」在這個專案裡不是 semver 意義上的穩定承諾，比較接近功能完整度里程碑。

➡️ **版本鎖定政策：`package.json` 鎖 `~1.7.x`（只收 patch），升 minor 視為一次有 review 成本的任務，流程走第 2 條的 diff。**

**Vercel 收購的風險是真的但已被對沖**：重心可能偏向 Vercel 平台與 agent identity 而非自架 Postgres 用例；「agnostic」是承諾不是保證。緩解手段是 MIT ＋ 我們擁有 schema ＋ ADR-0011 已把 domain 與 library 隔開 —— **抽換成本是刻意壓低的。這正是 ADR-0011 存在的理由，它在這裡第一次付出紅利。**

### 5. 擴充成本

- **(a) Google OAuth（v1）**：一段 `socialProviders.google` 設定 ＋ Google Cloud Console 建 OAuth client。**無額外 schema。** provider identity（Google `sub`）落在 `account.accountId`，`(issuer, accountId)` 為唯一複合索引 —— **正是 ADR-0011 §① 要的隔離位置**。production 務必設 `baseURL`，否則 redirect URI mismatch。
- **(b) magic link（不進 v1）**：`magicLink()` plugin，官方文件未列 schema 變更（推測沿用既有 `verification` 表，未驗證）。**真正的成本不在 library，在寄信基礎設施**（transactional email、DKIM/SPF、送達率）。票券 24 把它排除在 v1 之外的理由**不因 library 而改變**。
- **(c) organization / members plugin**：擴充路徑確實存在（`organization` / `member` / `invitation` 三張表，`member(organizationId, userId, role)` 正是 ADR-0011 §④ 所說「在 `ownerId` 之上加的東西」的自然形狀）。**約束 3（不得堵死協作）保持開放。** 但見第 7 條的警戒。
- **(d) 訪客入口**：`anonymous` plugin 能在**不經任何 OAuth provider** 的情況下建 session，schema 只在 `user` 表加一個 boolean `isAnonymous`，並提供 `onLinkAccount` 作為日後 link 到 Google 的掛點。**票券 24 的訪客體驗形狀有第一方解。**

⚠️ **但有一個會咬人的預設值（新發現）**：`onLinkAccount` 執行後，**anonymous user row 預設會被刪除**。而 `projects.owner_id` 正指著它 —— 有 FK 就 link 流程炸掉，是 `ON DELETE CASCADE` 就**把訪客的 demo project 一起刪掉**。

➡️ **裁決方向：目標是「就地升級」—— link 時把 Google account 掛到既有的 anonymous user 上，只把 `isAnonymous` 翻成 false，`UserId` 從頭到尾不變。** 理由是它與 ADR-0011 §③「所有 authentication entry point 收斂進同一條 pipeline、domain 不知道誰是訪客」字面一致。
➡️ **fallback**：設 `disableDeleteAnonymousUser: true`，在 `onLinkAccount` 內把 `projects.owner_id` 改指到新 user，再自行清理 anonymous row。
⚠️ plugin 是否支援就地升級**未驗證** —— 這是階段 3.5 的第二個 spike，且它決定的是**實作路徑**，不是 domain model（兩條路徑的 domain 形狀都成立）。

### 6. Auth.js v5：出局，而且不是因為它比較差

**2025-09-26 官方公告：Auth.js 交由 Better Auth 團隊維護、進入維護模式（「maintenance will continue for security and urgent issues」、「no immediate plans for v5」），並明說「若你在開新專案，我們推薦 Better Auth」。** 到 2026-09-01 為止 `next-auth` 的 `latest` 仍是 v4（4.24.15），v5 停在 `5.0.0-beta.32`；2026-02 社群那則「還要 beta 幾年」的 discussion 至今 Unanswered。

➡️ **「保守替代方案」這個角色已經空了。** 選 Auth.js v5 等於選一個被它自己的維護者勸退的 beta，而維護者就是候選方案 A 的團隊。

技術面它在三處也確實較差：id 產生規則的家在 Drizzle schema 而非 auth 設定、且 `account`／`session`／`verification` 的主鍵形狀不對稱（只有 `user` 有獨立 surrogate id）；**DB session 不能在 middleware 用**，官方要求拆 split config 並建議 edge 走 JWT；**沒有第一方 anonymous 支援**，Credentials provider 綁 JWT strategy，訪客入口會逼出兩套 session model。

### 7. 對 domain model 的衝擊：不動搖不變式 H，但新增一條可 grep 的守則

**不逼我們改任何東西。** `users.id` 保持 `usr_` + nanoid；`projects.owner_id` 完全不受影響（Better Auth 從不知道 `projects` 存在）；新增的只有 `session` / `account` / `verification` 三張表，都指向 `users.id`。「domain 永不讀 `account`」在此架構下**可用 grep 驗證**。唯一的正常代價：刪除 domain user 時要處理 auth 表的 FK。

**但研究把 ADR-0011 的警戒區從抽象變成具體了。** `organization` plugin 自帶完整 RBAC（`createAccessControl` / `hasPermission` / `organizationRole` / `session.activeOrganizationId`），官方文件自述「the plugin enforces all role-based access control checks」—— **那正是不變式 H 的〈Considered Options〉第一條明文否決的選項**。plugin 的存在不改變那個裁決，只是把誘惑放到手邊。

➡️ **新增守則（已寫進 [ADR-0011 後果 ⑤](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)）：採用任何 auth library plugin 時，只採用其資料模型，不採用其授權判斷。** 禁止清單：`createAccessControl`、`hasPermission`、`organizationRole` 的 dynamic AC、以及**以 `session.activeOrganizationId` 作為授權依據**（它是 UI 狀態，不是權限 —— 否則使用者換 tab 就換權限）。

之所以值得寫死成一條**可 grep** 的規則，是因為 ADR-0011 自己說過「靠慣例維持的東西會說謊」，而這條與 §① 的「domain 永不讀 `account`」是同一種可驗證的邊界。

**更保守的替代路徑也記在這裡**：協作真的要做時，可以**根本不用 organization plugin，自建那三張表** —— 它們是七個欄位的普通關聯表，plugin 帶來的是 API endpoint 與邀請流程，不是資料模型的難度。**用不用它是便利性取捨，不是能力取捨。**

### 階段 3.5 開工前的 spike 清單（實作期驗證，不是待決策項）

這張票是**選型決策**，決策已定。以下兩項是把文件層級的驗證補成行為層級的驗證，屬於實作者的第一步，**不另開票**：

1. **【高】自訂 `generateId` 的實際行為** —— 見第 1 條。這是 blocking criterion 的行為層佐證。
2. **【高】anonymous → Google 的 link 路徑對 `projects.owner_id` 的影響** —— 見第 5(d) 條。決定走「就地升級」還是 fallback。
3. 【中】`additionalFields` vs 自己加欄位（第 2 條）；【中】目標 Next.js 版本的 Node runtime middleware 實測（第 3 條，也影響票券 25）。

### 這張票不動的邊界（確認）

授權的責任邊界（不變式 H）、登入方式（Google OAuth 進 v1、magic link 延後、密碼出局）、訪客體驗的形狀 —— 三者**全部維持票券 24 的裁決**，本票的答案沒有動搖任何一條。
