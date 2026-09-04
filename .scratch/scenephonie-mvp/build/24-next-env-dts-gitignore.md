# 24 — `next-env.d.ts` 移出版控（upkeep）

**What to build:** 把 `apps/web/next-env.d.ts` 從 git 追蹤中移除（`git rm --cached`）並加進 `.gitignore`。這個檔案由 Next.js 自動生成、檔頭明寫 `This file should not be edited`，不是原始碼。

**為什麼是 upkeep、為什麼是現在：** Next.js 16（Turbopack）下，`next dev` 會把 typed-routes 的 reference 指向 `./.next/dev/types/…`，`next build` 則指向 `./.next/types/…`，於是 `next-env.d.ts` 會隨「最後一次跑的是 dev 還是 build」被覆寫，在本機產生假 diff（票券 22 提交的是 build 版）。內容零資訊量、CI 每次都會重新生成，繼續追蹤只會反覆污染 working tree。現在改動範圍最小 —— 只有這一個檔案在動。

**背景**：Next.js 官方 starter 目前仍會提交此檔，但社群普遍在 monorepo／多環境情境把它 gitignore（Next 也已知此 churn）。移除後 `pnpm dev` 或 `pnpm build` 任一次即會在本機重新生成，`tsconfig` 的 `include` 已涵蓋 `**/*.d.ts`，型別檢查不受影響。

**Blocked by:** 無（與 tracer-bullet 依賴圖無關；票券 22 已合併，可隨時開工）

**Status:** ready-for-agent

## 影響檔案

- `.gitignore` —— 在 `# Next.js` 區塊加一行 `apps/web/next-env.d.ts`（或更通用的 `next-env.d.ts`）
- `apps/web/next-env.d.ts` —— `git rm --cached apps/web/next-env.d.ts`，檔案留在磁碟

## 驗收

- [ ] `git ls-files apps/web/next-env.d.ts` 無輸出（已不追蹤）
- [ ] `apps/web/next-env.d.ts` 檔案仍存在於磁碟
- [ ] 乾淨 checkout 後跑一次 `pnpm --filter web build`（或 `dev`）會重新生成該檔，且 `git status` 不顯示它
- [ ] `pnpm typecheck` 綠燈（確認 `tsconfig` include 已涵蓋，型別檢查不因此漏 Next 的 ambient 宣告）
- [ ] `pnpm lint` / `pnpm test` / `pnpm build` 全綠

## Comments

**開票（2026-09-02）** —— 起因：`main` 上 `apps/web/next-env.d.ts` 出現 `./.next/types/` → `./.next/dev/types/` 的本機改動，經確認為 Next 16 dev／build 兩形態互換所致，已 `git checkout` 撤銷。此票把根因處理掉。

**實作（2026-09-04）** —— `.gitignore` 的 `# Next.js` 區塊加 `next-env.d.ts`（不加路徑前綴：monorepo 之後若再有 Next app 一體適用），`git rm --cached apps/web/next-env.d.ts`，檔案留在磁碟。驗收全過：刪掉檔案後 `pnpm --filter @scenephonie/web build` 會重新生成，`git status` 不再顯示它；`pnpm lint`／`typecheck`／`test`（66 passed）／`build` 全綠。
