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
  // PDF 匯出（票券 18）：Chromium 不進 bundle —— `@sparticuz/chromium` 在執行期從自己的 `bin/`
  // 解壓出瀏覽器，打包會把那些檔案弄丟。
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // 印 PDF 的那一支從 `public/fonts` 讀字型回應給 Chromium（Lambda 上沒有 CJK 字型），而 `public/`
  // 預設只走 CDN、不進函式包；`@sparticuz/chromium` 的 `bin/` 是執行期才讀的，追蹤不到。
  // ⚠️ 鍵是 picomatch glob —— 寫成 `[projectId]` 會被當成字元類別而永遠對不上，所以用 `*`。
  outputFileTracingIncludes: {
    "/projects/*/screenplays/*/deliveries/*/pdf": [
      "./public/fonts/**/*",
      // 套件從自己的實體路徑找 `bin/`；pnpm 的 `node_modules/@sparticuz/chromium` 只是 symlink。
      "../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  // Next 16 起 `next dev` 會在 app 目錄自動生成 AGENTS.md / CLAUDE.md。本 repo 採單一
  // context 佈局（repo 根的 CLAUDE.md + CONTEXT.md + docs/adr/），不要每個 app 各自長一份
  // agent 規則檔，故關閉。要接 Next 版本對齊的 agent 文件時再顯式開回。
  agentRules: false,
};

export default nextConfig;
