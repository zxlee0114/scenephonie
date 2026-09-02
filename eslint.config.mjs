import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "apps/web/drizzle/**",
      "**/*.config.*",
      "**/next-env.d.ts",
      // wayfinder 研究產物，不是專案原始碼
      ".scratch/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 規格 §5.5：isomorphic schema 套件不得有任何瀏覽器／React 相依。
    // node spec 與 node view 分家 —— 這一半要能單獨在 Node 跑測試。
    // 違反時 CI 的 lint job 會失敗（tsconfig 不載入 lib.dom 是第二道鎖）。
    files: ["packages/schema/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "schema 套件不得碰 DOM（規格 §5.5）" },
        { name: "document", message: "schema 套件不得碰 DOM（規格 §5.5）" },
        { name: "navigator", message: "schema 套件不得碰瀏覽器 API（規格 §5.5）" },
        { name: "localStorage", message: "schema 套件不得碰瀏覽器 API（規格 §5.5）" },
        { name: "sessionStorage", message: "schema 套件不得碰瀏覽器 API（規格 §5.5）" }
      ],
      // ESLint 的 import 黑名單是 defense-in-depth。真正 allowlist 形狀的鎖是
      // packages/schema/tsconfig.json 的 `lib: ["ES2022"]` + `types: []`：
      // 任何瀏覽器 API（不論來自哪個套件）都會是 tsc 型別錯誤。
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "@tiptap/*",
                "prosemirror-view",
                "prosemirror-view/*"
              ],
              message: "schema 套件只能是 isomorphic 純邏輯，node view 相依請留在 apps/web（規格 §5.5）"
            }
          ]
        }
      ]
    }
  }
);
