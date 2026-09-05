# 07 — 訪客體驗

**What to build:** 登入頁一顆「以訪客身分體驗」入口，**不放公開帳密**（那會把剛否決的密碼從後門放回來）。每次進入：建立 ephemeral user + clone 一份 demo project，**不用共用帳號**（共用帳號撞上「無同步層 ＋ 一列 jsonb 整列重寫」＝ last-write-wins 互相覆蓋，且打破「一個 `user` 列 ＝ 一個人」）。兩條入口（Google／訪客）收斂進**同一條 pipeline**，domain 不知道誰是訪客、零授權例外。`is_demo` 是 `users` 上的 infrastructure/lifecycle metadata，**不進 domain model**，**TTL 清理 7 天**。不長出 demo lifecycle domain。

**Blocked by:** 06

**Status:** in-review

- [x] 點「以訪客身分體驗」→ 得到自己的 user 身分與自己的 demo project 副本
- [x] 兩個訪客 session 互不覆蓋對方的稿（非共用帳號）
- [x] domain／command 層沒有「訪客」分支或授權例外
- [x] `is_demo` 不出現在 domain model；7 天 TTL 清理任務存在
- [x] Google 與訪客兩條入口走同一條 pipeline

## Comments

**2026-09-05 — 實作收票。** 兩道門並排在登入頁上，第二個箭頭之後**是同一段程式碼**：

```
Google OAuth → users.id → landingProject() → projects.owner_id → gate → command → doc
訪客入口     → users.id → landingProject() → projects.owner_id → gate → command → doc
```

`landingProject()` 多長出來的只有一個 `opening` 參數（開場放什麼）——**開場內容是入口點的問題，
不是授權的問題**，所以 domain、command、gate 全都不知道有訪客這回事。

### 三個當初沒有文件保證、現在有落庫實測的假設

1. **`isAnonymous → is_demo` 的欄位映射成立。** plugin 的 `schema.user.fields` 把 model 欄位名
   換成 Drizzle 屬性 `isDemo` → `is_demo` 欄。這是規格 §6.2 的名字，程式碼裡因此**只有一個叫法**，
   翻譯只發生在 `auth/auth.ts` 那一行。猜錯不會有人喊 —— 訪客只會靜靜地變成一個永遠不被清理的
   普通 user，然後在某個容量告警裡被發現。`guest-entry.integration.test.ts` 驗的是落庫那一列。
2. **訪客那道門不查 allowlist，而且是結構性地不查。** allowlist 的 hook 現在收 `ctx`，
   `ctx?.path === "/sign-in/anonymous"` 就不是它管的事。**這不是「訪客的例外」**——例外是
   「規則適用於你，但這次放你過」，而這條規則從來就只長在 Google 那道門上（它擋的是註冊）。
   其餘任何來源（未知 path、測試直呼 adapter）**一律查清單**：漏掉一道門是「誰都進得來」，
   漏掉訪客只是「訪客入口壞掉」，兩種失敗的代價不對稱。整合測試的 `AUTH_ALLOWED_EMAILS`
   裡沒有訪客的 placeholder email 也不可能有，所以每一個通過的測試同時也在證明這一條。
3. **cascade 真的接得上。** 清理只有一條 `DELETE FROM users`，專案／劇本／備份／session
   全靠 FK 帶走 —— TTL 測試直接驗了刪完之後 `projects` 那一列不在。

### 四處刻意的裁決

1. **demo 種子在程式碼裡，不是資料庫裡的一列樣板。**「clone」的實質是**每個訪客有自己的一份**，
   不是「複製某一列」。真放一列樣板進 DB，就得回答三個沒人在問的問題：那一列是誰的
   （它需要一個 `owner_id`）、誰維護、壞了誰修。程式碼裡的種子跟著 deploy 走，
   而且不可能被使用者改壞。每次呼叫現鑄 `sceneId` —— 共用的東西才有辦法互相覆蓋。
2. **範例稿只用今天真的存在的東西。** `location`／`dialogue.character` 只填 `displayName`、
   id 留 null，與現在使用者自己打字打出來的一模一樣；憑空鑄 `lo_`／`ch_` 會是指向不存在實體的
   引用，票券 08 一來就是一批髒資料。`appearingCharacters` 同理留 null。
3. **v1 不做「把訪客的稿搬到 Google 帳號」，但那條刪除路徑要主動關掉**（票券 30 §5(d)
   的 fallback，`disableDeleteAnonymousUser: true`）。詳見下面 code review 那一則 —— 這一條
   的初稿是錯的，而且錯得會掉資料。
4. **「最後活動」＝ 他那份稿最後一次被存檔的時間**（`screenplays.updated_at`），沒有稿就退回
   帳號建立時間。不看 session：session 會被 cookie cache 與背景刷新推著走，於是「還活著」
   會變成「瀏覽器還開著」而不是「還有人在寫」。改稿是這個產品裡唯一算數的活動，
   而它剛好已經被記在那一欄上 —— 不必為這支清理任務多開一個欄位。

### 新的可 grep 邊界

`authority-boundary.test.ts` 多兩條（ADR-0011 §③ 的機械版本）：`is_demo` 只准住在表的定義、
發身分那道門與 `guest/` 三處；domain／授權／persistence／編輯器／專案層一個訪客字眼都不准有。
兩條都先剝註解再比對（守的是程式碼在做什麼），並且都用一支暫時的違規檔驗證過**真的會紅**。

### 清理排程

一支 cron 兩件事（票券 25 §7）：`/api/cron/guest-cleanup` 每天 19:17 UTC（台北 03:17）跑一次，
它**同時就是** Supabase Free 的 keep-alive ping —— 一次真的資料庫查詢。兩件事共用一支排程不是
省事：它們的週期、失敗後果與「該不該有第二支」的答案完全一樣，拆開只會多一個會各自壞掉的東西。
端點認 `Bearer $CRON_SECRET`，**沒設 secret 就整支關閉並回 404**（回 401 等於告訴掃描器
「這裡有東西，只是你沒有鑰匙」——與 gate 回 404 同一條理由）。它也不收任何參數：
不能被用來指定刪誰，只能執行那條寫死的政策。

### 待人工驗收

- 真的點一次「以訪客身分體驗」，確認 land 在自己的範例專案、稿改得動、重整還在。
- 兩個瀏覽器（或無痕視窗）各進一次，互相改稿，確認**不會互相覆蓋**。
- 訪客身分手動改網址到別人的 `pj_` → 應為 404（走的是同一個 `authorizeProject`，
  不需要為訪客另外驗，但值得親眼看一次）。
- 部署時記得在 Vercel 設 `CRON_SECRET`，並確認排程真的有跑（沒設 ＝ 排程靜默地什麼都不做）。

**測試**：無 `DATABASE_URL` → 172 passed / 27 skipped；接上本機 Postgres → 199 passed。
`next build`、`tsc --noEmit`、`eslint` 皆綠。

**2026-09-05 — code review 後的修正（同一票）。** 兩軸審查（standards／spec）各自跑完。

**spec 軸抓到一個會掉資料的錯誤裁決，已修。** 初稿寫「v1 沒有訪客升級這件事，所以
票券 30 §5(d) 的 cascade 風險不會發生，因為陌生訪客過不了 allowlist」。**漏掉的不是陌生人，
是受邀者**：清單上的人先點「以訪客身分體驗」寫了東西、再用 Google 登入，就正好走進去。
allowlist 只擋**新建 user** 那一支，既有受邀者連 `create` hook 都不經過。

而 plugin 的 after-hook 在任何一支 `/sign-in`／`/callback` 之後，只要瀏覽器還帶著訪客 session
就會 `deleteUser(訪客的 id)` —— **與有沒有設 `onLinkAccount` 無關**，唯一的閘門是
`disableDeleteAnonymousUser`（`plugins/anonymous/index.mjs` 的
`options?.disableDeleteAnonymousUser || isSameUser || newSessionIsAnonymous`）。
`projects.owner_id` 是 `ON DELETE CASCADE`，所以那一刻消失的是一份稿。

旗標打開之後是**兩個身分並存**：Google 那邊是他的正式專案，訪客那一列連同範例稿留著，
七天後被 TTL 清掉。**刻意不做「把稿搬過去」** —— 搬家要回答「兩邊都已經有專案時怎麼辦」，
那是一個沒有人在問的問題；而「什麼都不做」的代價是他要重貼一次自己在範例稿上寫的字，
不是稿不見了。這兩者不對稱。

守它的測試在 `guest-entry.integration.test.ts`：測試裡開不出一次真的 Google callback，
所以打的是**讀同一個旗標的另一支端點**（`/delete-anonymous-user`），並比對錯誤訊息而不只是
「有丟東西出來」（壞掉的 cookie 也會丟）。**旗標暫時拿掉驗證過它真的會紅。**

**spec 軸另一項不成立**：「整合測試在沒有 `DATABASE_URL` 的 CI 上不會證明任何一條」——
`.github/workflows` 的 `verify` job 起了一顆真的 `postgres:16` 並設了 `DATABASE_URL`
（票券 05 的裁決：persistence 的行為只有在真的 Postgres 上才成立）。驗收框 1、2 在 CI 上是真的被驗的。

**standards 軸六項，改了五項**（第五項 `Record<string, unknown>` 的 attr 型別維持原樣：
有 hydrate 測試兜底，符合本 repo「用測試釘規則」的習慣）：

1. **拿掉一句可驗證為假的註解。** `GUEST_SIGN_IN_PATH` 原本寫「它有兩個讀者」，實際只有一個。
   這個 repo 的註解是承重的，假的理由比沒有註解更糟 —— 改成它真正的理由（它是一個安全判斷的
   左手邊，拼錯就是 allowlist 靜默失效），並收回沒有消費者的 `export`。
2. **cron secret 的比較補上裁決。** 不做 constant-time 是選擇不是疏漏：secret 是 32 bytes 隨機值，
   而攻擊者拿到它也只能觸發一條寫死的政策（端點不收參數）。這個檔案其他每個安全決定都寫了
   為什麼，這一條不能是唯一的空白。
3. **沒設 `CRON_SECRET` 時 `console.warn`。** 它關掉的不只是清理，還有 keep-alive ping，
   而那個失敗七天後會變成「資料庫被暫停、要人工復原」。排程每天打一次，所以這行每天會在
   紀錄裡出現一次 —— 沉默才是這裡真正的風險。
4. **`join("guest", "")` 的尾斜線**與 **`.sign-in__note` 的負上邊距**各補一句說明（同檔其餘
   每個非顯然構造都有）。
5. 測試裡 `sceneIdsOf`／`DAY_MS` 的小重複維持原樣：兩處形狀相同但語意不同（一個問 doc、
   一個問資料庫），抽出來只會多一個要跨檔案追的間接層。
