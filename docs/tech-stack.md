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

### 硬邊界

- **不可 edge-only 部署形態**：route handler 必須連得到 Postgres。`apps/web/src/app/api/health/route.ts`
  以 `export const runtime = "nodejs"` 明示。
- 不可用 Cloudflare Workers 純執行模式（票券 05，PDF 相關）。
- Supabase Auth／RLS／Storage／Realtime **不作為 domain/application 授權權威**（不變式 I、
  [ADR-0012](./adr/0012-infrastructure-provides-mechanism-not-authority.md)）。Supabase 在 v1 僅是 Postgres 託管。

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

`.github/workflows/ci.yml` 的 `verify` job 依序跑 **lint → typecheck → test → build**。其中 lint 同時強制
§5.5 的 isomorphic 邊界（`packages/schema/` 不得 import `react`/`next`/`@tiptap/*`，不得碰 `window`/`document`）。

**要讓「PR 全綠」成為合併必要條件**，需在 GitHub 專案設定手動開啟（repo 設定，非程式碼可控）：

> Settings → Branches → Branch protection rules → `main`
> ☑ Require status checks to pass before merging → 選 `verify`
> ☑ Require branches to be up to date before merging

## Vercel 專案設定（dashboard，一次性）

1. Import GitHub repo。
2. **Root Directory** 設 `apps/web`。
3. Framework Preset：Next.js（`vercel.json` 已鎖 `framework` 與 `regions`）。
4. Environment Variables：`DATABASE_URL`（Supavisor transaction，`:6543`）、`DIRECT_URL`（session，`:5432`）。
   Production 與 Preview 皆需設定。
5. Git：Production Branch = `main`；Preview Deployments 對所有其他分支的 PR 自動開啟（預設行為）。
