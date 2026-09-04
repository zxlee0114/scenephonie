# 27 — 新增場次時把該場次留在畫面中央（upkeep）

**What to build:** 在文件底部新增下一場時，畫面捲動到讓**正在處理的那一場**位於視窗中央，而不是讓它貼在視窗底緣。

**為什麼：** 目前新增場次靠瀏覽器原生的 `scrollIntoView` 行為，新場次會剛好出現在可視範圍的最下緣 —— 手要打的那一行貼著螢幕底邊，下方沒有任何餘裕。編劇是一路往下寫的，這個位置在整段寫作過程中都很難受（判準與 §7.10「八小時的疲勞度」同一條）。文書處理器與寫作工具的慣例是留一段「打字餘裕」（typewriter scrolling）：作用中的那一行維持在畫面中段，往下寫時是文件在動，不是眼睛在追。

**Blocked by:** 04（最小編輯器）。與票券 26 相關 —— 兩者都在決定「游標該出現在畫面的哪裡」，驗收要對齊。

**Status:** in-review

## 影響檔案

- `apps/web/src/editor/extensions/next-scene.ts` —— 新增場次的入口；目前的捲動行為由此觸發
- `apps/web/src/editor/nodes/scene.tsx` —— 新場次的 node view 掛載時已有 `requestFocus` 串接，捲動可以掛在同一個時機
- `apps/web/src/styles/editor.css` —— 若走「頁面底部留白」的做法（讓最後一場也捲得到中央），padding 是這裡的事

## 待決

- ~~**範圍**~~ 已定：只在「新增下一場」時置中。串接點是既有的 scene-birth 訊號（`scene-birth.ts`），不是「游標移動」—— 範圍剛好就是這張票要的那件事，鍵盤／`/next`／腳部按鈕三個入口都涵蓋。每一次打字都維持 typewriter scrolling 會與瀏覽器原生捲動打架，留給 design pass。
- ~~**「中央」的定義**~~ 已定：偏上，視窗高度的 **40%**（`TYPEWRITER_ANCHOR`）。下方要留給即將寫出來的內容。
- ~~頁面底部留白~~ 已定：**不動 CSS**。`.screenplay-page` 現有的 `40vh` 頁尾留白已經夠 —— 文件末端捲不到 40% 那條線時落點被夾住，新場次仍停在畫面中段（約 48%）而非底緣，驗收 #1 成立。為了幾個百分點把留白加大到 60vh，是拿驗收 #3 的「大片空白」去換，不划算。

## 驗收

- [ ] 在一份長度超過一個畫面的劇本底部新增下一場，新場次落在畫面中段（非底緣），下方仍有可視餘裕
- [x] 新場次的焦點串接（焦點落在新場次的內外景欄）不回歸
- [ ] 短劇本（內容不足一畫面）時不產生詭異的捲動或大片空白
- [x] `pnpm lint` / `typecheck` / `test` / `build` 全綠

## Comments

**開票（2026-09-04）** —— 票券 05 的本機驗收中由使用者提出：「我希望如果新增下一場到頁面底部時，能夠維持處理場次在畫面中心」。

**實作（2026-09-04）** —— 新模組 `apps/web/src/editor/typewriter-scroll.ts`：純函式
`writingScrollTop({ elementTop, scrollY, viewportHeight, maxScrollTop })` 算落點並夾在
`[0, maxScrollTop]`（夾住這件事同時吃掉「短劇本反向捲動」與「文件末端捲不到線」兩個邊界），
外面包一層讀 window／document 的 `scrollToWritingPosition(element)`。

串接走既有的 scene-birth 訊號，不新增一條路徑：`SceneView` 領到誕生通知時同步記一支 ref，
焦點串接那個 effect 讀到就改用 `focus({ preventScroll: true })` 再自己捲。同時
`command-bridge` 在 `focusNewSceneMeta` 時不再 `tr.scrollIntoView()` —— 否則瀏覽器先把新場次
推到視窗底緣、我們再捲一次，畫面會跳兩下。其他 command 的捲動行為不變。

`prefers-reduced-motion: reduce` 時 `behavior: "auto"`（不做平滑捲動）。

測試：`typewriter-scroll.test.ts`（落點算術，含短劇本與文件末端兩個夾住的情境）、
`scene-birth-scroll.test.tsx`（串接：誕生才捲、只捲一次、單純載入不捲、焦點串接不回歸）。
`test-setup.ts` 補上 `window.scrollTo` 的 no-op —— 與既有的 `Range` 補件同一類環境缺件。

驗收 #1 與 #3（真實瀏覽器裡的落點與留白觀感）待本機驗收。

**Code review（2026-09-04）** —— 一條 low severity：scene-birth 的 `born` 活在 module 層，
沒有 `claimFocus(() => true)` 的對應清理。`/next` 之後 1.5 秒內重整，末場又還沒開工時，
票券 31 的載入焦點請求會領到那筆過期的誕生 —— 「載入」被當成「剛新增」，重播浮現動畫並捲一次
打字餘裕。已修：新增 `resetSceneBirth()`。

⚠️ 清理的時機從 `onCreate` 移到 **`onBeforeCreate`** —— `onCreate` 晚於首批 node view 掛載
（`focus.ts` 早就記著這件事），那時 SceneView 已經把過期登記領走了；`onBeforeCreate` 在建構當下
同步跑。順帶把 `claimFocus(() => true)` 一起移過去（同一個競態，票券 26 的清理原本也踩得到），
並改為不分 `initialFocus` 都清 —— 兩本登記簿都只對「當下這個 instance」有意義。
迴歸測試已確認拿掉修正就會紅。
