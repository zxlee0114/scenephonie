# Scenephonie MVP —— 實作票券

從 [`../spec.md`](../spec.md) 拆出的 tracer-bullet 垂直切片。每張穿過 schema → command → projection → UI → 測試，可獨立驗收。依賴序編號（blockers 在前）。

**與 [`../issues/`](../issues/) 的分工**：`issues/` 是產出規格的 wayfinder 研究票（research／prototype／grilling）；本目錄是可開工的實作票。

## 依賴圖

```
01 專案骨架與 CI（+ Vercel preview deployment）
└─ 02 isomorphic schema kernel + projectScenes()
   └─ 03 domain command 層 kernel + 不變式測試框架
      └─ 04 最小編輯器 + CJK 字型載入
         ├─ 05 persistence 模組                    (← 04, 01)
         │  ├─ 06 認證 + 授權 gate + ownerId + 專案 hub
         │  │  └─ 07 訪客體驗
         │  └─ 08 人物與地點實體                    (ownerId 先 hardcode test user)
         │     ├─ 09 群演
         │     │  └─ 10 登場人物提示                (← 08, 09)
         │     └─ 11 子場次                         (← 04, 03, 08)
         │        ├─ 12 場次群組（對剪）
         │        │  └─ 13 跨層拖曳排序             (← 11, 12)
         │        └─ 14 草稿場次                    (← 11, 12, 02)
         │           ├─ 15 場次表檢視               (← 14, 08)
         │           ├─ 16 場次導覽 sidebar         (← 04, 14)
         │           └─ 17 delivery infrastructure  (← 14, 05)
         │              └─ 18 PDF renderer（GHSA）
         │                 ├─ 19 匯出前防呆         (← 18, 10)
         │                 ├─ 20 分享連結（即時+凍結）(← 18, 06)
         │                 └─ 21 交件文件與分場大綱  (← 08, 18, 06)
```

## 對照規格 §13.2 建議順序

| 規格階段 | 對應票券 |
|---|---|
| 0 isomorphic schema | 01, 02 |
| 1 domain command 層 | 03 |
| 2 編輯器 | 04 |
| 3 persistence | 05 |
| 3.5 認證 + 授權 + ownerId | 06, 07 |
| 4 實體 | 08, 09, 10 |
| 5 階層與平行 | 11, 12, 13 |
| 6 草稿 + 場次表 | 14, 15, 16 |
| 7 PDF 匯出 + 交付 | 17, 18, 19 |
| 8 分享連結 | 20 |
| 9 交件文件 | 21 |
| 10 分場大綱 | 21（已併入） |

## Frontier

blockers 全數 `Status:` 非 `ready-for-agent`（＝已完成）的票即可開工。純線性起點：01 → 02 → 03 → 04 → 05，之後分岔。

## Upkeep（不在 tracer-bullet 依賴圖裡）

| 票券 | 內容 |
|---|---|
| [22](./22-nextjs-16-upgrade.md) | Next.js 15 → 16 升級。無 blocker，建議排在票券 04 之前。 |
| [23](./23-schema-attr-romanization.md) | schema attr 鍵名羅馬化（中文 → 英文小駝峰，詞彙表不動）。blocked by 03，排在 03 合併之後。 |
| [24](./24-next-env-dts-gitignore.md) | `next-env.d.ts` 移出版控（Next 16 dev／build 兩形態互換造成的假 diff）。無 blocker。 |
