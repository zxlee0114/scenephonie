# 06 — 認證、授權 gate、`ownerId` 與專案 hub

**What to build:** v1 從第一天就是多租戶。**Better Auth `~1.7.x`**、Google OAuth（magic link 不進 v1，密碼出局）。`users.id` 由我們控制：`usr_` + nanoid（比照 `sc_`／`gr_`）；auth library 隨附表（`session`／`account` …）存在，但 **domain 只讀 `users.id`、永不讀 `account`**（一條 grep 可驗，[ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)）；**不做 shadow table**（「換 library 時 `owner_id` 不動」直接免費拿到）。`projects` 表：`id`、`type`（單一劇本專案，v1 唯一，不做類型選擇 UI）、`title`、`owner_id`（→ `users.id`）、meta 欄位；回填 `screenplays.project_id`。identity chain：`Scenephonie UserId → users.id → projects.owner_id`。allowlist 是 Google OAuth 的 registration/access policy，實作為 **env var 逗號清單**，**不建 `invitations` 表**。授權：application layer 的 gate；**command 只接受已授權的 project handle**，command 不負責建立 authorization（不變式 H）。middleware 只做 optimistic redirect，真正的 gate 在 route handler。DB session + cookie cache（`compact`，5 分鐘）。導覽（§7.10）：純 routes + 專案首頁 hub、編輯器頁只有極簡 header／breadcrumb 回專案；route tree `/projects/:id/screenplays/:id` 已編碼層級。基礎設施提供機制不提供授權真理（不變式 I、[ADR-0012](../../../docs/adr/0012-infrastructure-provides-mechanism-not-authority.md)）—— Supabase Auth／RLS 不作為權威來源。

**Blocked by:** 05

**Status:** in-review

- [x] Google 登入後 land 在自己的專案；未登入被 optimistic redirect
- [x] 另一個使用者對非自己的專案，route handler 的 gate 回絕（不是靠 UI 藏）
- [x] `users.id` 是 `usr_` + nanoid；一條 grep 可驗「domain 不讀 `account`」
- [x] 不做 shadow table；換 auth library 不需動 `owner_id`
- [x] allowlist 是 env var；repo 內無 `invitations` 表
- [x] command pipeline 只接受已授權的 project context；authorization 不在 command 內
- [x] 專案首頁 hub 以純 route 呈現，無文件 sidebar；breadcrumb 回專案
- [x] Supabase 僅作 PostgreSQL 託管；其 Auth／RLS／Storage／Realtime 不作為授權權威

## Comments

**2026-09-04 — 實作收票。** 票券 30 列的兩個「開工前 spike」做完了，而且**沒有留成一次性驗證，
直接變成常駐測試**（`apps/web/src/auth/auth.integration.test.ts`）——一次性的驗證會過期，測試不會：

1. **`generateId` 的實際行為：通過。** `users.id` 真的是 `usr_` + nanoid，`sessions.user_id`
   跟著走（落庫的那一列也驗了，不只回傳值）。**blocking acceptance criterion 成立，不做影子表。**
   ⚠️ `options.model` 傳進來的確切字串仍有歧義（單數還是 `modelName` 的複數），所以
   `MODEL_PREFIXES` 兩種拼法都掛上去、指向同一個前綴 —— 猜錯也不會鑄出錯的 id。
2. **anonymous → Google 的 link 路徑**（票券 30 §5(d)）**沒做**：那是票券 07（訪客體驗）的事，
   本票沒有引入 `anonymous` plugin，`projects.owner_id` 也就沒有那個風險面。

四處與票券文字不同、刻意為之的地方：

1. **`projects` 只長了 `title`，沒長其餘 meta 欄位**（§4.2 的劇情大綱／人物介紹／編劇姓名…）。
   它們唯一的消費者是交件 PDF 的前置頁（票券 21），現在長出來會是一組**沒有寫入者也沒有讀取者**
   的欄位 —— 與票券 05 當初不預先長 `project_id` 是同一條理由。
2. **allowlist 擋兩次，權威在我們這一層。** registration 那一半在 Better Auth 的
   `databaseHooks.user.create.before`（不在清單上連 `users` 都不會有一列）；**access 那一半在
   `authorization/session.ts` 自己再問一次** —— 因為「把 email 移出清單」要在下一次請求就生效
   而不是等 session 過期，也因為授權的權威必須在 application layer（不變式 I）。
3. **`/projects` 是轉接口不是清單頁。** v1 使用者只會有一部作品在寫，專案清單是一個多出來的停點；
   `/projects` 因此直接把人送去 `landingProject()`（沒有專案就開一個，連同它那一份劇本 ——
   1:1 是「單一劇本專案」這個 type 的**定義**，不是待放寬的限制）。多部作品那天它就是清單長出來的位置。
4. **`screenplays.project_id` 的「回填」實際上是清空。** 這一欄之前的每一列劇本都由票券 05 的
   鷹架 `loadOrCreateSoleScreenplay()` 建立，**沒有 owner 可以回填**，而遷移之後也沒有任何 route
   到得了它們。替它們硬湊一個 owner 等於憑空發明「這是誰的」。gate 存在之前不得對外開放（票券 05
   的收票註記），所以清掉的只可能是本機／preview 的開發資料。詳見 `drizzle/0003_*.sql` 的註解。

**新的可 grep 邊界**：`apps/web/src/authorization/authority-boundary.test.ts` 把 ADR-0011 §①§⑤ 與
ADR-0012 §① 的清單變成測試 —— domain 不讀 `accounts`、無 `createAccessControl`／`hasPermission`／
`organizationRole`／`activeOrganizationId`、無 `@supabase/*` client 與 RLS、無影子表、無 `invitations` 表。
它**先剝掉註解再比對**：守的是程式碼在做什麼，不是文字裡出現過哪些詞，否則這條規則會反過來
禁止大家在註解裡解釋它自己。

**票券 05 的已知缺口已關閉**：`saveScreenplayAction` 現在第一件事就是過 gate，persistence 的每一支
都只吃已授權的 handle（`createScreenplay` 吃 `AuthorizedProject`，`loadScreenplay`／`saveScreenplay`
吃 `AuthorizedScreenplay`）——「沒授權就呼叫」在型別上表示不出來，不是靠每個 handler 記得檢查。

**仍待部署時處理（不屬本票）**：`screenplay_backups` 的 append-only 仍是程式碼層規則，要變成保證
得撤掉執行期角色的 `UPDATE`／`DELETE` 權限，那是 DB 角色的事，本票處理的是 application layer 的授權。

**未在真實 Google OAuth 上跑過**：需要 Google Cloud Console 的 OAuth client 與對外網址，
機器上沒有憑證。整條 callback 之後的路徑（建 user → 建 session → gate → 專案 hub）由整合測試涵蓋，
**但 provider 那一段是文件層級的信心，不是行為層級的**。第一次部署時要親手走一次。
