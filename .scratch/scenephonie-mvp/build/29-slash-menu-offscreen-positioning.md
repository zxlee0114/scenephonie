# 29 — slash 選單在捲動後跑到視窗之外（bug）

**症狀：** 在比較後面的場次（需要捲動才看得到的那些）按 `/`，選單不出現在游標旁，而是跑到視窗上方看不見的地方。第一場正常。

**Blocked by:** 04（`extensions/slash.tsx` 在該票交付）

**Status:** verified

## 根因（已定位，不必再查）

`apps/web/src/editor/extensions/slash.tsx:93`

```tsx
<div className="slash-menu" style={{ top: state.rect.bottom + 6, left: state.rect.left }}>
```

`state.rect` 來自 Tiptap suggestion 的 `props.clientRect()`，那是 `getBoundingClientRect()` 的結果 —— **視窗座標**。但 `.slash-menu` 在 `editor.css:438` 是 `position: absolute`，解析的是最近的定位祖先（或初始包含塊＝文件）—— **文件座標**。

兩套座標差一個 `window.scrollY`。第一場在頁面頂端、`scrollY ≈ 0`，兩者剛好重合，所以看起來是對的；一旦捲下去，選單就被放到視窗上緣之外 `scrollY` 個像素。這也是為什麼「越後面的場次越明顯」。

`slash-menu.test.ts` 抓不到：jsdom 沒有真正的排版與捲動，`getBoundingClientRect()` 一律回 0。

## 解法（兩條，擇一）

**A. 改成 `position: fixed`。** 視窗座標對視窗座標，數字直接對得上，不必讀 `scrollY`，捲動時也不會飄。要注意的是任何祖先若有 `transform`／`filter`／`contain` 都會變成 fixed 的包含塊 —— 目前 `.screenplay-page` 一路上去沒有這些，但這是隱性耦合，值得在 CSS 留一行註解說明。

**B. 維持 `absolute`，加上捲動位移**（`top: rect.bottom + window.scrollY + 6`）。改動更小，但每次捲動都要重新計算，且 `.screenplay-page` 之下若日後出現定位祖先就會再壞一次。

傾向 A。

## 順手要做的事（同一個定位問題的另一半）

選單目前無條件開在游標**下方**。當游標接近視窗底緣時，選單會被視窗下緣裁掉 —— 和本票是同一類缺陷、同一段程式。修的時候一併處理：**空間不足時翻到游標上方**，水平方向同理不要超出視窗右緣。

## 影響檔案

- `apps/web/src/editor/extensions/slash.tsx` —— 第 93 行的行內 style
- `apps/web/src/styles/editor.css` —— `.slash-menu`（第 438 行起）的 `position`
- `apps/web/src/editor/slash-menu.test.ts` —— 現有測試涵蓋的是選單的內容與鍵盤操作，定位測不到（見上）；若要守住，得用可注入的 rect 把「rect → 座標」那段純函式化再測

## 驗收

- [x] 捲到文件後段的場次按 `/`，選單出現在游標正下方且完整可見
- [x] 第一場（未捲動）的行為不回歸
- [x] 選單開著時捲動頁面，選單不會與游標脫節（選跟隨，不是關閉 —— 捲動時重問一次 `clientRect()`）
- [x] 游標接近視窗底緣時選單翻到上方，不被裁切；接近右緣時不超出視窗
- [x] `slash-menu.test.ts` 既有案例不回歸
- [x] `pnpm lint` / `typecheck` / `test` / `build` 全綠
- [x] （驗收中追加）點選單以外的任何地方都關閉選單，不限編輯器內部

## Comments

**開票（2026-09-04）** —— 票券 05 的本機驗收中由使用者回報：「比較後面的場次開的 slash 選單會看不到，會在視窗之外的上方出現」。根因當場定位（視窗座標餵給文件座標的絕對定位），寫在上面。獨立開票而非併入 27／28：27 是捲動位置、28 是軟換行、本票是彈出層定位，三者成因不同、改的檔案也不同。

**交付（2026-09-04）** —— 採方案 A。`.slash-menu` 改 `position: fixed`，CSS 留了註解記下
「祖先出現 `transform`／`filter`／`contain` 就會再壞一次」這條隱性耦合。「rect → 座標」抽成
`editor/slash-menu-position.ts` 純函式（票券預期的做法），下方塞不下翻上、右緣塞不下往左收、
兩側各留 8px；捲動與改變視窗大小時重問一次 `clientRect()`，所以選單跟著游標而不是被關掉。
視窗尺寸讀 `documentElement.clientWidth/Height` 而非 `innerWidth/Height` —— 後者含捲軸寬，
會讓靠右夾限的選單躲到捲軸底下。

**驗收中追加：點外面就收起來（2026-09-04）** —— 使用者回報「只能點編輯器內部才收得起來」。
成因是關閉只有一條路：Tiptap suggestion 的 exit，而那要編輯器收到 transaction 才會發生；
點 header、點頁面留白都不進編輯器，選單就留在畫面上。新增 `editor/dismiss-on-outside-pointer.ts`
（capture 階段的 `pointerdown`，和 `Escape` 走同一個出口）。

第一版接線是壞的，值得記下來：effect 在**執行的當下**讀 `ref.current` 才決定要不要註冊監聽器，
但 `open` 先變 `true`、選單要等 suggestion 交出 `clientRect` 才畫得出來 —— 那一幀 ref 還是 null，
deps 只有 `[open]` 就不會再跑第二次，監聽器從來沒被掛上。helper 的單元測試全綠也照樣漏掉：
它只證明 helper 會呼叫 close，證不到它有沒有被接上去。改成在事件當下才問元素，並補
`slash-menu-dismiss.test.tsx`（真的元件配真的 suggestion plugin），該支在修之前是紅的。

**本機驗收（2026-09-04）** —— 七條全過。
