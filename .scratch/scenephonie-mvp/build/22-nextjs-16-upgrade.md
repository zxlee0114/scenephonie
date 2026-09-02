# 22 — Next.js 15 → 16 升級

**What to build:** 把 `apps/web` 從 Next.js `15.5.x` 升到 `16.x`（現行 latest `16.3.4`），並重新驗證骨架的每一條保證仍成立。這是 **upkeep 票，不在 §13.2 的 tracer-bullet 依賴圖裡** —— 票券 01 把 Next 標為「初步」鎖定、未釘版本號，升級不牴觸規格。範圍限於框架本身與其連帶影響：bundler（Next 16 預設 Turbopack）、caching 模型（`cacheComponents` / `'use cache'` 的預設語意變動）、被移除的 API、`next.config.ts` 的設定鍵、CI 與 Vercel preview deployment。**不夾帶**其他功能或相依升級。

drizzle-orm／drizzle-kit／react 已於本分支的相依 refresh commit 更新到最新，本票不重做。

**Blocked by:** None —— 可獨立進行。**建議排在票券 04（編輯器）之前**，避免 Tiptap 整合完成後又要對整個 bundler／caching 行為重驗一次；若票券 18（PDF，`@sparticuz/chromium` + Puppeteer）先落地，本票需一併重驗 serverless function 打包。

**Status:** in-review

**風險與已知變動點（開工前確認官方 upgrade guide 為準）：**

- **Turbopack 成為 `next build` / `next dev` 預設。** 需確認 `pnpm build` 在 Turbopack 下綠燈，或明確用 `--webpack` 退回並把選擇寫進 `next.config.ts` 註解／`docs/tech-stack.md`。`transpilePackages: ["@scenephonie/schema"]`、`outputFileTracingRoot` 要在所選 bundler 下都有效。
- **內建 `next lint` 指令移除。** 本專案不用它（CI 跑 `pnpm lint` = `eslint .`，flat config）。但 `next.config.ts` 的 `eslint: { ignoreDuringBuilds: true }` 鍵可能被棄用／改名 —— 確認 build 不再因此噴 warning／error。
- **Caching 預設語意。** `/api/health` 是對真實表做 round-trip 的 route handler，**必須維持 dynamic**，不得被靜態優化。決定 `cacheComponents`（原 `dynamicIO`）／`'use cache'` 是採用還是本票延後 —— 若延後，寫一行理由；若採用，非顯而易見的取捨開一則 ADR。
- **最低 Node 版本。** Next 16 要求 Node ≥ 20.9。`.nvmrc` 現為 `22`、CI 用 `node-version-file: .nvmrc`，應無需改；仍要核對 `package.json` 的 `engines`（`>=22`）與 Vercel 專案的 Node 設定。
- **React 19.2。** 已滿足（本分支已升到 `^19.2.8`）。
- **被移除／改名的設定與 API。** 逐項對照官方 codemod（`npx @next/codemod@latest upgrade latest`）的輸出，不盲套。

**驗收：**

- [x] 乾淨 checkout 下 `pnpm install --frozen-lockfile` → `pnpm build` 在 Next 16 綠燈；bundler 選擇（Turbopack 或退回 webpack）有紀錄與理由
- [x] `pnpm dev` 開得起來，`/` 與 `/api/health` 皆正常回應
- [x] `/api/health` 仍是 dynamic（對 Postgres round-trip），未被靜態優化；`getDb()` 的 lazy 連線路徑不受影響，`next build` 不需要 `DATABASE_URL`
- [x] `pnpm typecheck`、`pnpm test`、`pnpm lint` 全綠（§5.5 isomorphic 邊界的 lint job 照舊擋得住違規）
- [x] `transpilePackages` / `outputFileTracingRoot` 在所選 bundler 下有效，monorepo file-tracing 無新 warning
- [~] CI workflow（`.github/workflows/ci.yml`）如有對 Next 行為的隱含假設一併更新；PR 的 Vercel preview deployment 綠燈、route handler 在 preview／production 都連得到 Postgres
- [x] caching 模型的決定（採用 `cacheComponents`/`'use cache'` 或延後）寫下理由；非顯而易見的取捨開 ADR
- [x] `docs/tech-stack.md` 的技術棧表更新 Next 版本；`next.config.ts` 的設定變動有註解說明

## Comments

### 升級摘要（票券 22）

**版本**：`next` `^15.5.4` → `^16.3.4`。react／react-dom 已於本分支的相依 refresh commit
升到 `^19.2.8`（滿足 Next 16），本票未動。Node（`.nvmrc` = `22`、`engines` `>=22`）已滿足
Next 16 的 `>=20.9`，未改。

**`apps/web/next.config.ts` 變動**：

- 移除 `eslint: { ignoreDuringBuilds: true }` —— Next 16 移除了 `eslint` 設定鍵與內建
  `next lint`，`next build` 本來就不再跑 lint。lint 仍由 CI 獨立 job（`pnpm lint` =
  `eslint .`，flat config，含 §5.5 邊界）負責。
- 新增 `agentRules: false` —— Next 16 的 `next dev` 預設會在 app 目錄生成 `AGENTS.md` /
  `CLAUDE.md`。本 repo 用單一 context 佈局（repo 根的 `CLAUDE.md` + `CONTEXT.md` +
  `docs/adr/`），不要每個 app 各自長 agent 規則檔，故關閉。
- `transpilePackages` / `outputFileTracingRoot` 未動；兩鍵在 Turbopack 下皆生效。註解補上
  bundler 與 caching 的決策說明。

**Bundler**：採 Next 16 預設的 Turbopack。無自訂 webpack 設定、無需 webpack loader 的相依，
不加 `--webpack` 退回。`pnpm build` 在 Turbopack 下綠燈，monorepo file-tracing 無新 warning。

**Caching**：不採用 `cacheComponents`（原 `experimental.dynamicIO` / `useCache`，Next 16 已移除；
PPR flag 亦移除）。骨架無 `'use cache'` 或 RSC 資料快取，啟用只是多出 Cache Components 模型的
遷移成本。理由寫進 `next.config.ts` 註解與 `docs/tech-stack.md`。屬保守預設，未開 ADR。

**驗證**（乾淨 `pnpm install --frozen-lockfile` 後）：

- `pnpm build`（Turbopack）綠燈；路由表 `/api/health` = `ƒ (Dynamic)`、`/` = `○ (Static)`。
  build 不需 `DATABASE_URL`。
- `pnpm dev` 綠燈；`GET /` → 200，`GET /api/health` → 打到 handler（本機無 `DATABASE_URL`
  故回 503 `"DATABASE_URL 未設定"`，正好證明它會做 Postgres round-trip、未被靜態優化）。
- `pnpm typecheck` / `pnpm test`（42 tests）/ `pnpm lint` 全綠。
- `next-env.d.ts` 由 Next 16 重生（新增 typed-routes 的 `routes.d.ts` / `root-params.d.ts`
  reference），一併提交。

**未由本票驗證**：Vercel preview deployment 綠燈、preview／production 的 route handler 連
Postgres —— 需 PR 開出後在 Vercel 上觀察，非本機可驗。`.github/workflows/ci.yml` 檢視過，
對 Next 行為無隱含假設（`.nvmrc` 供版本、`NEXT_TELEMETRY_DISABLED` 仍有效），未改。
