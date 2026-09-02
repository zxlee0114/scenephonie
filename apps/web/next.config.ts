import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // monorepo：把 isomorphic schema 套件的 TS 原始碼交給 Next 轉譯。
  transpilePackages: ["@scenephonie/schema"],
  // 追蹤根設到 repo 根，消掉 monorepo 下的 file-tracing 警告。
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // lint 由 CI 的獨立 job 跑（`pnpm lint`），不重複卡在 build。
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
