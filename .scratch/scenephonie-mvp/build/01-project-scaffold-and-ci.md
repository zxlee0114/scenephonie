# 01 — 專案骨架與 CI

**What to build:** 一個開得起來的空 app、一條會擋 PR 的綠 CI，與每個 PR 一個 preview deployment。建立 Next.js + TypeScript 專案、Drizzle ORM 接本機 Postgres（Supabase local）、vitest 測試 runner。確立 isomorphic 模組邊界：一個放 schema／推導函式的套件（或目錄），不得有任何瀏覽器相依，能單獨在 Node 跑測試（規格 §5.5、§13.2 階段 0）。CI 在每個 PR 跑 lint + type check + test + build。Vercel Hobby（region `hnd1`／東京）接上 repo，每個 PR 產生 preview deployment，push 到 default branch 部署 production；route handler 連得到 Postgres（不可 edge-only 形態）。技術棧鎖定值（Next.js、Drizzle、PostgreSQL、Supabase Free 東京、Vercel Hobby `hnd1`）記進 repo。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 乾淨 checkout 下 `install` → `build` 成功，空首頁開得起來
- [ ] `test` 執行 vitest，至少一個 smoke 測試通過
- [ ] schema 目錄／套件的 import 邊界有工具強制（無 DOM／`window`／React 相依），違反時 CI 失敗
- [ ] Drizzle 連得上本機 Postgres，migration 指令可跑
- [ ] CI workflow：lint + typecheck + test + build，PR 全綠為合併必要條件
- [ ] 每個 PR 有一個可點開的 Vercel preview deployment；default branch 部署 production
- [ ] preview／production 的 route handler 連得到 Postgres（`DATABASE_URL` 走 Supavisor transaction mode `:6543` + `prepare: false`；migration 走 `DIRECT_URL` session mode）
- [ ] §13.1 的技術棧鎖定值與 region 意圖記錄在 repo
