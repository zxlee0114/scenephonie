import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // 預設 node（isomorphic 邊界 smoke 等）；編輯器測試檔各自用 `// @vitest-environment jsdom`。
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
