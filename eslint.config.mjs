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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "schema 套件不得相依 React（規格 §5.5）" },
            { name: "react-dom", message: "schema 套件不得相依 React（規格 §5.5）" },
            { name: "next", message: "schema 套件不得相依 Next.js（規格 §5.5）" }
          ],
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
