import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // monorepo：把 isomorphic schema 套件的 TS 原始碼交給 Next 轉譯。
  // Turbopack（Next 16 起 `next dev` / `next build` 預設 bundler）與 webpack 皆支援此鍵。
  transpilePackages: ["@scenephonie/schema"],
  // 追蹤根設到 repo 根，消掉 monorepo 下的 file-tracing 警告。
  // output file-tracing 是 build 期產物分析，與所選 bundler 無關，Turbopack 下同樣生效。
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // bundler：採用 Next 16 預設的 Turbopack（`next build` 未加 `--webpack`）。本專案無自訂
  // webpack 設定，無退回 webpack 的理由；決策紀錄見 docs/tech-stack.md「Bundler」。
  //
  // Next 16 移除了 `eslint` 設定鍵與內建 `next lint`：lint 一律由 CI 的獨立 job 跑
  // （`pnpm lint` = `eslint .`，flat config），`next build` 本來就不再跑 lint。
  //
  // caching：本票不採用 `cacheComponents`（原 `experimental.dynamicIO` / `useCache`）。
  // 骨架沒有任何 `'use cache'` 或 RSC 資料快取，啟用只會多出 Cache Components 模型的
  // 遷移成本而無收益；`/api/health` 靠 route handler 預設 dynamic + 顯式
  // `dynamic = "force-dynamic"` 維持對 Postgres 的 round-trip。屬保守預設，不另開 ADR。
  typescript: { ignoreBuildErrors: false },
  // Next 16 起 `next dev` 會在 app 目錄自動生成 AGENTS.md / CLAUDE.md。本 repo 採單一
  // context 佈局（repo 根的 CLAUDE.md + CONTEXT.md + docs/adr/），不要每個 app 各自長一份
  // agent 規則檔，故關閉。要接 Next 版本對齊的 agent 文件時再顯式開回。
  agentRules: false,
};

export default nextConfig;
