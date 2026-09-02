# 22 — Next.js 15 → 16 升級

**What to build:** 把 `apps/web` 從 Next.js `15.5.x` 升到 `16.x`（現行 latest `16.3.4`），並重新驗證骨架的每一條保證仍成立。這是 **upkeep 票，不在 §13.2 的 tracer-bullet 依賴圖裡** —— 票券 01 把 Next 標為「初步」鎖定、未釘版本號，升級不牴觸規格。範圍限於框架本身與其連帶影響：bundler（Next 16 預設 Turbopack）、caching 模型（`cacheComponents` / `'use cache'` 的預設語意變動）、被移除的 API、`next.config.ts` 的設定鍵、CI 與 Vercel preview deployment。**不夾帶**其他功能或相依升級。

drizzle-orm／drizzle-kit／react 已於本分支的相依 refresh commit 更新到最新，本票不重做。

**Blocked by:** None —— 可獨立進行。**建議排在票券 04（編輯器）之前**，避免 Tiptap 整合完成後又要對整個 bundler／caching 行為重驗一次；若票券 18（PDF，`@sparticuz/chromium` + Puppeteer）先落地，本票需一併重驗 serverless function 打包。

**Status:** ready-for-agent

**風險與已知變動點（開工前確認官方 upgrade guide 為準）：**

- **Turbopack 成為 `next build` / `next dev` 預設。** 需確認 `pnpm build` 在 Turbopack 下綠燈，或明確用 `--webpack` 退回並把選擇寫進 `next.config.ts` 註解／`docs/tech-stack.md`。`transpilePackages: ["@scenephonie/schema"]`、`outputFileTracingRoot` 要在所選 bundler 下都有效。
- **內建 `next lint` 指令移除。** 本專案不用它（CI 跑 `pnpm lint` = `eslint .`，flat config）。但 `next.config.ts` 的 `eslint: { ignoreDuringBuilds: true }` 鍵可能被棄用／改名 —— 確認 build 不再因此噴 warning／error。
- **Caching 預設語意。** `/api/health` 是對真實表做 round-trip 的 route handler，**必須維持 dynamic**，不得被靜態優化。決定 `cacheComponents`（原 `dynamicIO`）／`'use cache'` 是採用還是本票延後 —— 若延後，寫一行理由；若採用，非顯而易見的取捨開一則 ADR。
- **最低 Node 版本。** Next 16 要求 Node ≥ 20.9。`.nvmrc` 現為 `22`、CI 用 `node-version-file: .nvmrc`，應無需改；仍要核對 `package.json` 的 `engines`（`>=22`）與 Vercel 專案的 Node 設定。
- **React 19.2。** 已滿足（本分支已升到 `^19.2.8`）。
- **被移除／改名的設定與 API。** 逐項對照官方 codemod（`npx @next/codemod@latest upgrade latest`）的輸出，不盲套。

**驗收：**

- [ ] 乾淨 checkout 下 `pnpm install --frozen-lockfile` → `pnpm build` 在 Next 16 綠燈；bundler 選擇（Turbopack 或退回 webpack）有紀錄與理由
- [ ] `pnpm dev` 開得起來，`/` 與 `/api/health` 皆正常回應
- [ ] `/api/health` 仍是 dynamic（對 Postgres round-trip），未被靜態優化；`getDb()` 的 lazy 連線路徑不受影響，`next build` 不需要 `DATABASE_URL`
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm lint` 全綠（§5.5 isomorphic 邊界的 lint job 照舊擋得住違規）
- [ ] `transpilePackages` / `outputFileTracingRoot` 在所選 bundler 下有效，monorepo file-tracing 無新 warning
- [ ] CI workflow（`.github/workflows/ci.yml`）如有對 Next 行為的隱含假設一併更新；PR 的 Vercel preview deployment 綠燈、route handler 在 preview／production 都連得到 Postgres
- [ ] caching 模型的決定（採用 `cacheComponents`/`'use cache'` 或延後）寫下理由；非顯而易見的取捨開 ADR
- [ ] `docs/tech-stack.md` 的技術棧表更新 Next 版本；`next.config.ts` 的設定變動有註解說明
