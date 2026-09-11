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

票券 **41** 已拆成 43–51（它本身不關閉，九輪裁決過程是那批票唯一的出處）。與既有兩張票的關係：
**40**（群演欄選單措辭）是 41 的 blocker，它立的三列在 47 之後一字不改地繼續成立；
**42**（`不修改，返回` 進人物／地點欄）與這一串**平行不重疊** —— 42 的第 3 條已由 48 吸收、
第 4 條已切成 52，兩張票共用的只有 `↰`／`↩︎` 兩個記號常數，不構成 blocker。

| 票券 | 內容 |
|---|---|
| [22](./22-nextjs-16-upgrade.md) | Next.js 15 → 16 升級。無 blocker，建議排在票券 04 之前。 |
| [23](./23-schema-attr-romanization.md) | schema attr 鍵名羅馬化（中文 → 英文小駝峰，詞彙表不動）。blocked by 03，排在 03 合併之後。 |
| [24](./24-next-env-dts-gitignore.md) | `next-env.d.ts` 移出版控（Next 16 dev／build 兩形態互換造成的假 diff）。無 blocker。 |
| [25](./25-github-actions-node24.md) | CI actions 升到 Node 24 runtime（checkout v7／setup-node v7／pnpm action-setup v6）。無 blocker。 |
| [26](./26-restore-caret-to-document-end.md) | 重整後焦點落在文件末端（載入既有劇本時；新建仍落在第一場內外景欄）。blocked by 05。 |
| [27](./27-keep-active-scene-centered.md) | 新增場次時把該場次留在畫面中央（typewriter scrolling）。blocked by 04，與 26 對齊。 |
| [28](./28-soft-break-caret-at-block-end.md) | bug：`Shift+Enter` 的 `\n` 被 DOM parse 洗成半形空格（sceneBlock 未宣告 `whitespace: "pre"`）。blocked by 04。 |
| [29](./29-slash-menu-offscreen-positioning.md) | bug：slash 選單捲動後跑到視窗外（視窗座標餵給 `position: absolute`）。blocked by 04。 |
| [30](./30-slash-next-leaves-empty-block.md) | bug：`/next` 在原場次留下一個空區塊。blocked by 04。 |
| [31](./31-load-focus-unfilled-last-scene.md) | 載入時末場還沒填 metadata，焦點落在該場 chip row。blocked by 26。 |
| [32](./32-empty-document-state.md) | 零場次時的空狀態（全選刪除後不是死路；不自動補場次）。blocked by 04。 |
| [33](./33-entity-field-ui-polish.md) | 實體欄位與欄位說明的視覺／互動打磨（浮層翻邊、觸控上的快捷鍵揭露、預覽的份量）。blocked by 08。 |
| [34](./34-chip-row-caret-return.md) | chip row 與內文之間的鍵盤往返（方向鍵）—— 進了內文就回不到 metadata；Shift+Tab 回頭會順手把區塊轉成對白。blocked by 04，排在 09 之後。 |
| [35](./35-promote-extra-to-character.md) | 從群演裡升格一個人物（特約）—— 對白人物欄多一條「從這批人裡拉一個出來」的路，群演人數同時減一。blocked by 09、10。 |
| [36](./36-promote-picker-and-menu-hints.md) | 升格改成兩層選單，選單旁一欄唯讀說明 —— 標籤放結果、說明另外放。blocked by 35。**那條分工是 41／48 那行唯讀提示的前例**。 |
| [37](./37-undo-returns-the-typed-name.md) | bug：⌘Z 撤銷一筆 chip 時，編劇打的字沒有回到輸入框（那串字從來不在 doc 裡）。blocked by 08。**排在 48 之前** —— 48 那條「⌘Z 把打到一半的字還回來」沿用它，不另寫一套。 |
| [38](./38-editing-ref-is-not-an-orphan.md) | bug（已完成）：正在編輯的那一筆被當成不存在，於是冒出「建立新實體」。**只補了「完全相等」那一格，前綴那一格留給 52**。 |
| [39](./39-rename-entity-in-place.md) | 把實體改名，要有一個正經入口（已完成）。它立下的選單形狀與「代價寫在按下去之前」是 40 的 blocker。 |
| [40](./40-extras-edit-says-what-it-does.md) | 改一批群演時選單要說它真的在做的事（已完成）—— `✏️ 把「A」改成「B」`／`↩︎ 不修改，返回`／`＋ 新增「B」，保留「A」`。**41 與 42 都 blocked by 它**；那三列在 47 之後一字不改地繼續成立。 |
| [41](./41-extra-count-is-an-estimate.md) | **parent（不關閉）**：群演人數常常只是大概。九輪裁決已拆成 43–51，內文保留當那批票唯一的出處。blocked by 40。 |
| [42](./42-put-back-row-wording-in-entity-field.md) | `↩︎ 不修改，返回` 要進人物／地點欄，且每一階段都找得到。blocked by 40。**與 43–51 平行不重疊**：第 3 條已由 48 吸收、第 4 條已切成 52，只共用 `↰`／`↩︎` 兩個記號常數。 |
| [43](./43-adr-numbers-in-names-are-not-counts.md) | ADR-0013：名稱帶數字時不解析人數（`路人 8` 是名字不是人數；寧可漏判不可誤判）。無 blocker。票券 41 拆出。 |
| [44](./44-count-value-expand.md) | **expand**：群演人數的四種樣子（確切／區間／下限／若干）與既有 `count: number` 並存，畫面零改動。無 blocker。票券 41 拆出。 |
| [45](./45-migrate-schema-value-semantics.md) | 遷移批次 1：值語意改吃四種樣子，顯示改用括號不用乘號。blocked by 43、44。 |
| [46](./46-migrate-commands-four-shapes.md) | 遷移批次 2：command 收得下四種樣子；升格減一在區間／下限／若干上是什麼（票券 35 的延伸）。blocked by 45，與 47 平行。 |
| [47](./47-migrate-extras-field-edit-state.md) | 遷移批次 3：改群演名字時人數自動保留，編輯框只認名稱。blocked by 45，與 46 平行。**票券 40 那三列一字不改地繼續成立**。 |
| [48](./48-migrate-count-submenu.md) | 遷移批次 4：`修改數量…` 子選單（`↰ 不修改數量（8），回上一步`／若干／1／自由輸入）。blocked by 47、37（那條 ⌘Z 驗收沿用 37，不在群演欄另寫一套 undo 還字）。**吸收了票券 42 的第 3 條**（群演欄那一側的「回上一步」），並先加上 `↰`／`↩︎` 兩個共用記號給 42 沿用。 |
| [49](./49-migrate-add-flow-and-promote-wording.md) | 遷移批次 5：新增流程對齊；對白人物欄與升格措辭不再印乘號（票券 35 那一列）。blocked by 48、46。 |
| [50](./50-contract-drop-legacy-count.md) | **contract**：刪掉 `count: number`，四種樣子成為 canonical，開發資料庫 reset（不升 `doc_schema_version`）。blocked by 45–49。 |
| [51](./51-rewrite-context-extras-decision.md) | CONTEXT.md 群演實作定案第 1 條連同理由改寫（票券 09 那條被推翻）。blocked by 50。 |
| [52](./52-editing-ref-matches-itself-by-prefix.md) | bug：握著一筆實體、清空重打前綴命中不了自己（票券 38 那條裂縫）。**從票券 42 的第 4 條切出來**，與 42 的措辭工作無關。blocked by 40。 |
