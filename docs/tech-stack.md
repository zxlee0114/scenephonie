# 技術棧鎖定值與部署意圖

規格 §13.1 的鎖定值在此落地為 repo 的事實來源。**「已鎖定」不代表不可反轉**——反轉條件見
[`.scratch/scenephonie-mvp/issues/25-deployment-and-hosting.md`](../.scratch/scenephonie-mvp/issues/25-deployment-and-hosting.md) §8 的六條 tripwire。

## 鎖定值（§13.1）

| 層 | 選擇 | 鎖定程度 | 在 repo 的落點 |
|---|---|---|---|
| 框架 | Next.js **16**（App Router）＋ TypeScript | 初步（版本號不鎖，隨 upkeep 票升級） | `apps/web/`、`apps/web/package.json` |
| Bundler | **Turbopack**（Next 16 起 `next dev` / `next build` 預設） | 隨框架 | `apps/web/next.config.ts` |
| 資料庫 | PostgreSQL ＋ Drizzle ORM | 初步 | `apps/web/src/db/`、`apps/web/drizzle.config.ts` |
| 測試 runner | Vitest | — | 各套件 `vitest.config.ts` |
| isomorphic schema | 獨立套件，零瀏覽器相依，Node 可單獨跑測試 | 已鎖定（§5.5 / §13.2 階段 0） | `packages/schema/`（`tsconfig` 無 `lib.dom` ＋ ESLint 邊界規則） |
| 部署 | **Vercel Hobby，region `hnd1`（東京）** | 已鎖定（可反轉） | `vercel.json` (`regions: ["hnd1"]`) |
| 資料庫託管 | **Supabase Free，東京（`ap-northeast-1`）**，僅作 PostgreSQL 託管 | 已鎖定 | `apps/web/.env.example`、`docs/adr/0012-*` |
| 連線模型 | **`DATABASE_URL` 走 Supavisor transaction mode `:6543` ＋ `prepare: false`**；migration 走 **`DIRECT_URL`** session mode | 已鎖定 | `apps/web/src/db/client.ts`、`apps/web/drizzle.config.ts` |
| 認證 | **Better Auth `~1.7.x`**（只收 patch）＋ Google OAuth；**DB session ＋ cookie cache**（`compact`、5 分鐘）；middleware 只做 optimistic redirect | 已鎖定（可替換的 infrastructure decision） | `apps/web/src/auth/`、`apps/web/src/proxy.ts` |
| 授權 | **application layer 的 gate；write use case 只吃已授權的 project handle** | 已鎖定（不變式 H） | `apps/web/src/authorization/` |

### 硬邊界

- **不可 edge-only 部署形態**：route handler 必須連得到 Postgres。`apps/web/src/app/api/health/route.ts`
  以 `export const runtime = "nodejs"` 明示。
- 不可用 Cloudflare Workers 純執行模式（票券 05，PDF 相關）。
- Supabase Auth／RLS／Storage／Realtime **不作為 domain/application 授權權威**（不變式 I、
  [ADR-0012](./adr/0012-infrastructure-provides-mechanism-not-authority.md)）。Supabase 在 v1 僅是 Postgres 託管。
- **auth library 不得成為授權真理來源**（不變式 H、[ADR-0011](./adr/0011-authentication-identity-is-not-domain-authority.md)）。
  可 grep 的守衛在 `apps/web/src/authorization/authority-boundary.test.ts`：domain 永不讀 `accounts`、
  不得出現 `createAccessControl`／`hasPermission`／`organizationRole`／`activeOrganizationId`、
  不得有影子表、repo 內不得有 `invitations` 表。

## 認證與授權（票券 06）

**schema 主權在我們。** Better Auth 的 CLI 對 Drizzle 只做 `generate`（吐 TypeScript，不碰資料庫），
所以 `users`／`sessions`／`accounts`／`verifications` 四張表就住在 `apps/web/src/db/schema.ts`，
migration 走我們自己的 `drizzle-kit` 鏈，**沒有第二套 migration 系統**。

**升 Better Auth minor 版的流程**（`~1.7.x` 只收 patch，升 minor 是一次有 review 成本的任務）：

```bash
pnpm --filter @scenephonie/web add better-auth@~1.8.0     # 1. 升版
npx auth@latest generate --config <暫時的 auth 設定> --output /tmp/ba-schema.ts   # 2. 重跑 generator
diff /tmp/ba-schema.ts apps/web/src/db/schema.ts          # 3. diff
#                                                          4. 人工併進我們的 schema（保留註解與命名）
pnpm db:generate && pnpm db:migrate                       # 5. 正常的一次 migration
```

第 4 步是人工的，也**應該**是人工的 —— 那正是「schema 主權在我們」的代價與好處。

**環境變數**（見 `apps/web/.env.example`）：`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、
`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`AUTH_ALLOWED_EMAILS`。
最後一條是 allowlist —— **Google OAuth 的 registration/access policy，不是 `invitations` 表**；
**沒設或設空＝誰都不准進**（fail closed）。

**Google Cloud Console 一次性設定**：APIs & Services → Credentials → Create OAuth client ID →
Web application，Authorized redirect URI 填 `<BETTER_AUTH_URL>/api/auth/callback/google`
（production 與每一個要登入的 preview 網址各填一條）。

## 訪客體驗與排程清理（票券 07）

登入頁的第二道門走 Better Auth 的 `anonymous` plugin（`/sign-in/anonymous`）：每位訪客有**自己的**
`users` 那一列與**自己的**範例專案副本，不是共用帳號。plugin 的 `isAnonymous` 欄位用 `schema`
選項映到我們的 `users.is_demo`（規格 §6.2 的名字）——那是 **infrastructure／lifecycle metadata，
不進 domain model**，兩條入口之後走的是同一條 pipeline。

**allowlist 只長在 Google 那道門上**（`databaseHooks.user.create.before` 依 endpoint path 判定，
其餘來源一律查清單）。訪客不進 allowlist，但也**不因此取得任何超出正常 User authorization
model 的東西**。

**TTL 清理**：`vercel.json` 的 cron 每天 19:17 UTC（台北 03:17）打一次
`/api/cron/guest-cleanup`，把「`is_demo` 且七天沒動過稿」的 `users` 列刪掉，其餘靠 FK cascade。
它同時就是票券 25 §7 那支 keep-alive ping（Supabase Free 七天無活動即暫停）。
端點認 `Authorization: Bearer $CRON_SECRET`，**沒設 secret ＝ 整支關閉**（它會刪資料，
預設值不能是「誰都能打」）。

## Bundler 與 caching（Next 16，票券 22）

- **Bundler：Turbopack。** Next 16 起是 `next dev` / `next build` 的預設。本專案沒有自訂
  webpack 設定，也沒有需要 webpack loader 的相依，故不加 `--webpack` 退回。`pnpm build`
  已在 Turbopack 下綠燈。`transpilePackages` 與 `outputFileTracingRoot` 兩鍵在 Turbopack
  下皆生效，monorepo file-tracing 無新 warning。
- **Caching：不採用 `cacheComponents`。** Next 16 移除了 `experimental.dynamicIO` /
  `experimental.useCache`，PPR flag 也一併移除；要選擇性預渲染改用頂層 `cacheComponents`。
  骨架沒有任何 `'use cache'` 或 RSC 資料快取，啟用只會多出 Cache Components 模型的遷移
  成本而無收益，故本票延後。`/api/health` 靠 route handler 預設 dynamic ＋ 顯式
  `export const dynamic = "force-dynamic"` 維持對 Postgres 的 round-trip，`next build`
  的路由表確認它是 `ƒ (Dynamic)`、未被靜態優化。屬保守預設，未達開 ADR 的門檻。
- **`next lint` 與 `eslint` 設定鍵移除。** lint 一律由 CI 獨立 job 跑（`pnpm lint` =
  `eslint .`，flat config，含 §5.5 isomorphic 邊界）；`next.config.ts` 不再有 `eslint` 鍵。
- **`agentRules: false`。** Next 16 的 `next dev` 預設會在 app 目錄生成 `AGENTS.md` /
  `CLAUDE.md`；本 repo 用單一 context 佈局（repo 根的 `CLAUDE.md` + `CONTEXT.md` +
  `docs/adr/`），故在 `next.config.ts` 關閉。

## Region 意圖

- Vercel Serverless Functions：`hnd1`（東京）。單一 region —— Hobby 方案限制，且與資料庫同區以壓低往返延遲。
- Supabase 專案：`ap-northeast-1`（東京）。與 Vercel function region 同城是**刻意**的：每次 route handler
  查詢都跨 pooler，異區會把 RTT 疊上去。

## CI 與合併閘門

`.github/workflows/ci.yml` 的 `verify` job 依序跑 **lint → typecheck → migrate → test → build**。其中 lint 同時強制
§5.5 的 isomorphic 邊界（`packages/schema/` 不得 import `react`/`next`/`@tiptap/*`，不得碰 `window`/`document`）。

**CI 起一顆真的 Postgres**（`services: postgres:16`，直連 `:5432`，`DATABASE_URL` 與 `DIRECT_URL` 都指它）。
理由是 persistence 的並行控制、lazy 遷移與自動備份（§6.7）只有在真的資料庫上才成立 —— 用替身測交易邊界，
測到的是替身。migrate 步驟先把表建起來，測試才有東西可跑。

本機跑同一組測試：`docker compose up -d db`，並讓 `DATABASE_URL` 指向它。**沒設 `DATABASE_URL` 時
整組整合測試會跳過**（其餘測試照跑），所以只改編輯器的人不必先開資料庫。

**要讓「PR 全綠」成為合併必要條件**，需在 GitHub 專案設定手動開啟（repo 設定，非程式碼可控）：

> Settings → Branches → Branch protection rules → `main`
> ☑ Require status checks to pass before merging → 選 `verify`
> ☑ Require branches to be up to date before merging

## Vercel 專案設定（dashboard，一次性）

1. Import GitHub repo。
2. **Root Directory** 設 `apps/web`。
3. Framework Preset：Next.js（`vercel.json` 已鎖 `framework` 與 `regions`）。
4. Environment Variables：`DATABASE_URL`（Supavisor transaction，`:6543`）、`DIRECT_URL`（session，`:5432`）、
   `BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`AUTH_ALLOWED_EMAILS`、
   `CRON_SECRET`（訪客 TTL 清理排程，票券 07；不設就等於關掉那支排程）。
   Production 與 Preview 皆需設定。⚠️ `BETTER_AUTH_URL` 必須是該環境對外的真實網址，否則
   Google 的 redirect URI 會對不上。
5. Git：Production Branch = `main`；Preview Deployments 對所有其他分支的 PR 自動開啟（預設行為）。
