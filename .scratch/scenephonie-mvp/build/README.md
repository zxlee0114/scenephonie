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

| 規格階段 | 對應票券 | 驗收 |
|---|---|---|
| 0 isomorphic schema | 01, 02 | ✅ 01、✅ 02 |
| 1 domain command 層 | 03 | ✅ 03 |
| 2 編輯器 | 04 | ✅ 04 |
| 3 persistence | 05 | ✅ 05 |
| 3.5 認證 + 授權 + ownerId | 06, 07 | ✅ 06、✅ 07 |
| 4 實體 | 08, 09, 10 | ✅ 08、✅ 09、✅ 10 |
| 5 階層與平行 | 11, 12, 13 | ✅ 11、✅ 12、✅ 13 |
| 6 草稿 + 場次表 | 14, 15, 16 | ✅ 14、✅ 15、✅ 16 |
| 7 PDF 匯出 + 交付 | 17, 18, 19 | ✅ 17、✅ 18、✅ 19 |
| 8 分享連結 | 20 | ✅ 20 |
| 9 交件文件 | 21 | ⬜ 21 |
| 10 分場大綱 | 21（已併入） | ⬜ 21 |

## Frontier

blockers 全數 `Status:` 為 `done` 或 `verified`（＝已完成）的票即可開工。其餘狀態（`ready-for-agent`、`in-review`、`open`）一律算未完成 —— `open` 的 upkeep 票與 `in-review` 還沒 merge 的票都擋得住後面的票。純線性起點：01 → 02 → 03 → 04 → 05，之後分岔。

上下兩張表的「驗收」欄是各票 `Status:` 的投影：✅ ＝ `done` 或 `verified`，⬜／反引號裡的字 ＝ 還沒完成（`verified` 是人工驗收過，較早的票只標到 `done`）。**改了票的 `Status:`，這一欄也要跟著改** —— 沒有機制同步，靠這行與 code review。

## Upkeep（不在 tracer-bullet 依賴圖裡）

票券 **41** 已拆成 43–51（它本身不關閉，九輪裁決過程是那批票唯一的出處）。與既有兩張票的關係：
**40**（群演欄選單措辭）是 41 的 blocker，它立的三列在 47 之後一字不改地繼續成立；
**42**（`不修改，返回` 進人物／地點欄）與這一串**平行不重疊** —— 42 的第 3 條已由 48 吸收、
第 4 條已切成 52，兩張票共用的只有 `↰`／`↩︎` 兩個記號常數，不構成 blocker。

| 票券 | 內容 | 驗收 |
|---|---|---|
| [22](./22-nextjs-16-upgrade.md) | Next.js 15 → 16 升級。無 blocker，建議排在票券 04 之前。 | ✅ done |
| [23](./23-schema-attr-romanization.md) | schema attr 鍵名羅馬化（中文 → 英文小駝峰，詞彙表不動）。blocked by 03，排在 03 合併之後。 | ✅ done |
| [24](./24-next-env-dts-gitignore.md) | `next-env.d.ts` 移出版控（Next 16 dev／build 兩形態互換造成的假 diff）。無 blocker。 | ✅ done |
| [25](./25-github-actions-node24.md) | CI actions 升到 Node 24 runtime（checkout v7／setup-node v7／pnpm action-setup v6）。無 blocker。 | ✅ done |
| [26](./26-restore-caret-to-document-end.md) | 重整後焦點落在文件末端（載入既有劇本時；新建仍落在第一場內外景欄）。blocked by 05。 | ✅ verified |
| [27](./27-keep-active-scene-centered.md) | 新增場次時把該場次留在畫面中央（typewriter scrolling）。blocked by 04，與 26 對齊。 | ✅ verified |
| [28](./28-soft-break-caret-at-block-end.md) | bug：`Shift+Enter` 的 `\n` 被 DOM parse 洗成半形空格（sceneBlock 未宣告 `whitespace: "pre"`）。blocked by 04。 | ✅ verified |
| [29](./29-slash-menu-offscreen-positioning.md) | bug：slash 選單捲動後跑到視窗外（視窗座標餵給 `position: absolute`）。blocked by 04。 | ✅ verified |
| [30](./30-slash-next-leaves-empty-block.md) | bug：`/next` 在原場次留下一個空區塊。blocked by 04。 | ✅ verified |
| [31](./31-load-focus-unfilled-last-scene.md) | 載入時末場還沒填 metadata，焦點落在該場 chip row。blocked by 26。 | ✅ done |
| [32](./32-empty-document-state.md) | 零場次時的空狀態（全選刪除後不是死路；不自動補場次）。blocked by 04。 | ✅ verified |
| [33](./33-entity-field-ui-polish.md) | 實體欄位與欄位說明的視覺／互動打磨（浮層翻邊、觸控上的快捷鍵揭露、預覽的份量）。blocked by 08。 | `open` |
| [34](./34-chip-row-caret-return.md) | chip row 與內文之間的鍵盤往返（方向鍵）—— 進了內文就回不到 metadata；Shift+Tab 回頭會順手把區塊轉成對白。blocked by 04，排在 09 之後。 | ✅ done |
| [35](./35-promote-extra-to-character.md) | 從群演裡升格一個人物（特約）—— 對白人物欄多一條「從這批人裡拉一個出來」的路，群演人數同時減一。blocked by 09、10。 | ✅ done |
| [36](./36-promote-picker-and-menu-hints.md) | 升格改成兩層選單，選單旁一欄唯讀說明 —— 標籤放結果、說明另外放。blocked by 35。**那條分工是 41／48 那行唯讀提示的前例**。 | `open` |
| [37](./37-undo-returns-the-typed-name.md) | bug：⌘Z 撤銷一筆 chip 時，編劇打的字沒有回到輸入框（那串字從來不在 doc 裡）。blocked by 08。**排在 48 之前** —— 48 那條「⌘Z 把打到一半的字還回來」沿用它，不另寫一套。 | ✅ done |
| [38](./38-editing-ref-is-not-an-orphan.md) | bug：正在編輯的那一筆被當成不存在，於是冒出「建立新實體」。**只補了「完全相等」那一格，前綴那一格留給 52**。 | ✅ done |
| [39](./39-rename-entity-in-place.md) | 把實體改名，要有一個正經入口。它立下的選單形狀與「代價寫在按下去之前」是 40 的 blocker。 | ✅ done |
| [40](./40-extras-edit-says-what-it-does.md) | 改一批群演時選單要說它真的在做的事—— `✏️ 把「A」改成「B」`／`↩︎ 不修改，返回`／`＋ 新增「B」，保留「A」`。**41 與 42 都 blocked by 它**；那三列在 47 之後一字不改地繼續成立。 | ✅ done |
| [41](./41-extra-count-is-an-estimate.md) | **parent（不關閉）**：群演人數常常只是大概。九輪裁決已拆成 43–51，內文保留當那批票唯一的出處。blocked by 40。 | — parent |
| [42](./42-put-back-row-wording-in-entity-field.md) | `↩︎ 不修改，返回` 要進人物／地點欄，且每一階段都找得到。blocked by 40。**與 43–51 平行不重疊**：第 3 條已由 48 吸收、第 4 條已切成 52，只共用 `↰`／`↩︎` 兩個記號常數。 | `open` |
| [43](./43-adr-numbers-in-names-are-not-counts.md) | ADR-0013：名稱帶數字時不解析人數（`路人 8` 是名字不是人數；寧可漏判不可誤判）。無 blocker。票券 41 拆出。 | ✅ done |
| [44](./44-count-value-expand.md) | **expand**：群演人數的四種樣子（確切／區間／下限／若干）與既有 `count: number` 並存，畫面零改動。無 blocker。票券 41 拆出。 | ✅ done |
| [45](./45-migrate-schema-value-semantics.md) | 遷移批次 1：值語意改吃四種樣子，顯示改用括號不用乘號。blocked by 43、44。 | ✅ done |
| [46](./46-migrate-commands-four-shapes.md) | 遷移批次 2：command 收得下四種樣子；升格減一在區間／下限／若干上是什麼（票券 35 的延伸）。blocked by 45，與 47 平行。 | ✅ done |
| [47](./47-migrate-extras-field-edit-state.md) | 遷移批次 3：改群演名字時人數自動保留，編輯框只認名稱。blocked by 45，與 46 平行。**票券 40 那三列一字不改地繼續成立**，只是 `↩︎ 不修改，返回` 從第一列的措辭變成自己一列、永遠在（人工驗收追加）。抬頭的新措辭與放手後的 ⌘Z 分別落在 48、53。 | ✅ done |
| [48](./48-migrate-count-submenu.md) | 遷移批次 4：`修改數量…` 子選單（`↰ 不修改數量（8），回上一步`／若干／1／自由輸入）。blocked by 47、37（那條 ⌘Z 驗收沿用 37，不在群演欄另寫一套 undo 還字）。**吸收了票券 42 的第 3 條**（群演欄那一側的「回上一步」），並先加上 `↰`／`↩︎` 兩個共用記號給 42 沿用。 | ✅ done |
| [49](./49-migrate-add-flow-and-promote-wording.md) | 遷移批次 5：新增流程對齊；對白人物欄與升格措辭不再印乘號（票券 35 那一列）。blocked by 48、46。 | ✅ done |
| [50](./50-contract-drop-legacy-count.md) | **contract**：刪掉 `count: number`，四種樣子成為 canonical，開發資料庫 reset（不升 `doc_schema_version`）。blocked by 45–49。 | ✅ done |
| [51](./51-rewrite-context-extras-decision.md) | CONTEXT.md 群演實作定案第 1 條連同理由改寫（票券 09 那條被推翻）。blocked by 50。 | ✅ done |
| [52](./52-editing-ref-matches-itself-by-prefix.md) | bug：握著一筆實體、清空重打前綴命中不了自己（票券 38 那條裂縫）。**從票券 42 的第 4 條切出來**，與 42 的措辭工作無關。blocked by 40。呈現另有兩輪追加裁決：只有這一場認識的名字印成 `🕓` 歷史紀錄而非實體，且**手上那一筆不印場數**（後者推翻 2026-09-11）。 | ✅ done |
| [53](./53-let-go-undo-restores-raw-text.md) | bug：群演放手之後的 ⌘Z 還回來的是一串裸字（瀏覽器對 input 的原生 undo），`extraId` 與人數都沒了。**從票券 47 的人工驗收切出來**；與 37 的分工是「焦點還在欄位裡」對「焦點已經走了」。 | ✅ done |
| [54](./54-held-extra-undo-duplicates.md) | bug：握著一批、框裡空著時按 ⌘Z，同一批人變成兩份。 | ✅ done |
| [55](./55-field-marks-to-svg-icons.md) | chore：欄位裡那些記號（`📍 👤 👥 ＋ ✏️ ↩︎ ↰ ✅ 💡`）換成一套風格一致的 SVG，不吃系統 emoji 字型。 | `open` |
| [56](./56-scene-nodeview-stale-extras.md) | bug：剛新增的群演，同一場的對白人物欄當下看不到。 | ✅ done |
| [57](./57-select-chips-in-a-field.md) | 一格裡的 chip 選得起來：`⌘A` 選滿整格、`⌫` 清空，四格一致；按到底放行給整份文件。選取狀態是**一組 chip**（為以後的子集與剪貼留形狀）。**拖曳定案給重排、選取永不靠拖**。blocked by 無（08／09／34 皆已完成）。剪貼另開票。 | `open` |
| [58](./58-single-value-field-caret-after-commit.md) | bug：單值欄（非雜景地點欄、對白人物欄）定案之後輸入框卡在 chip **前面** —— `merge` 的單值分支沒把 `caret` 歸位，而 `reset()` 靠它歸位。**從票券 52 的人工驗收切出來**，與 52 無關（根因在票券 39 的游標歸位）。 | ✅ done |
| [59](./59-voice-style-entry.md) | 發聲方式（V.O./O.S.）的輸入入口 —— `voiceStyle` 在 schema 裡，但沒有 UI 設得到。規格 §4.6：併進對白人物欄的自動補全。**從票券 10 切出來**（提示的判準已經在讀這個 attr）。blocked by 10。 | `open` |
| [60](./60-speaker-field-caret-before-chip-layout.md) | bug：對白人物欄游標走到 chip 前面時，輸入框撐開、把 chip 推到欄位中間 —— 違反「縫」的版面（不佔版面）。**從票券 10 驗收撈到**，與 10 無關。 | `open` |
| [61](./61-speaker-field-left-exits-to-previous-block.md) | 對白人物欄最前面按 ← 走不回上一個區塊。落點與場次第一個區塊的情況開工前問。**從票券 10 驗收撈到**。 | `open` |
| [62](./62-empty-dialogue-backspace-reverts.md) | 對白之間的 Enter／Backspace 不對稱：空對白按 Backspace 收不回；台詞開頭 Enter 切出第二句對白後回不去，而且 Backspace 會**刪掉上一句有人物的對白（資料遺失）**。**從票券 10、21 驗收撈到**。 | `open` |
| [63](./63-canonical-host-redirect.md) | 非正式網域一律 308 轉到 `BETTER_AUTH_URL` 的 host —— 從 deployment 網址登入時 `state` cookie 跨網域，Google 登入偶爾失敗。無 blocker。 | `open` |
| [64](./64-login-error-code-swallowed.md) | bug：登入頁讀不到 Better Auth 的錯誤碼（`error` 被接成兩個 query），「不在受邀清單上」永遠顯示不出來。無 blocker。 | ✅ verified |
| [65](./65-autosave-retry-backoff.md) | 存檔失敗後退避重試（2.5 秒起跳加倍、封頂 60 秒、持續再試）；狀態列倒數、「立刻重試」與 ⌘S、離開前提醒。無 blocker。 | ✅ verified |
| [66](./66-dialogue-without-speaker-is-draft.md) | 沒有人物的對白也讓場次成為草稿（票券 14 的草稿判定）。無 blocker。 | `needs-triage` |
| [67](./67-add-scene-from-clipboard.md) | 新增下一場時，可以改成貼上剛複製的場次。blocked by 13。 | `needs-triage` |
| [68](./68-scene-menu-move-and-swap.md) | 場次選單的「搬移到…」與「對調…」—— 拖曳之外的另一條路，規則與拖曳相同。blocked by 13。 | `needs-triage` |
| [69](./69-unsaved-draft-local-backup.md) | 存不進去的稿，關掉分頁之後救得回來（本機備份）。碰到 spec 排除的離線編輯，範圍開工前先定。**從票券 65 驗收切出來**，blocked by 65。 | `needs-triage` |
| [70](./70-oauth-state-cookie-expiry.md) | Google 登入超過 5 分鐘才回來就失敗（state cookie 寫死 300 秒，DB 那筆是 10 分鐘），畫面只說「請再試一次」。**從票券 64 驗收切出來**，無 blocker。 | `needs-triage` |
| [71](./71-project-dashboard-and-create-flow.md) | 登入（含訪客）後先到專案儀表板；「建立專案」是三步彈窗（名稱必填 → 故事大綱／分場大綱頁籤 → 建立專案或建立並開始寫劇本），最後一次交易建好全部，中途離開只留本機草稿、下次問要不要接著做。劇本長出自己的劇本名稱。無 blocker。 | ✅ verified |
| [72](./72-project-archive-and-delete.md) | 專案封存（只整理儀表板，照常可編輯，可取消封存）與刪除（進已刪除區 30 天、gate 擋下、可還原回原本那區，到期由改名後的 `daily-cleanup` cron 永久刪除）；封存期間分享連結照常、刪除即失效。 | ✅ verified |
| [73](./73-onboarding-tour.md) | 引導：首次註冊者與訪客跟著一份範例專案走完整個流程，只看不填；跳過或走完才算用掉，可隨時重看。blocked by 71、21。 | `needs-triage` |
| [74](./74-autosave-status-display.md) | 存檔狀態列的節奏：打字時「儲存中」、存完停留一段、閒置時不顯示或「上次儲存於…」，不再跳動。劇本與文件共用。**從票券 21 驗收撈到**，無 blocker。 | `needs-triage` |
| [75](./75-rename-project-and-screenplay.md) | 改專案名稱與劇本名稱（建立後目前改不了）。**從票券 71 grilling 拆出來**，blocked by 71。 | `needs-triage` |
| [76](./76-nodejs-security-update-2026-10.md) | Node.js 釘到 2026-10-21 安全修補版 22.23.4（`.nvmrc`、`engines.node`、CI、Vercel 一致）。**Brotli decoder RCE（CVE-2026-111497）與數個 TLS／DNS 驗證問題。**無 blocker。 | ✅ verified |
| [77](./77-nodejs-version-auto-tracking.md) | 自動追蹤 Node.js 安全更新（Renovate 傾向；只追 22.x minor／patch，`.nvmrc` 與 `engines.node` 要同步）。blocked by 76。 | ✅ verified |
| [78](./78-character-sheet-in-creation-wizard.md) | 建立精靈第 2 步多一個「人物介紹」頁籤：草稿存名字與內文，建立專案的交易裡才鑄人物、寫角色設定表。**從票券 21 第 ② 片 grilling 拆出來**，blocked by 21、71。 | `needs-triage` |
| [79](./79-autocomplete-hits-aliases.md) | 自動補全認得別場用過的叫法：打的名字是別場的顯示名（別名）時命中那筆實體，不再只給「建立新實體」、冒出第二個同名人物。**從票券 21 驗收撈到**，無 blocker。 | `needs-triage` |
