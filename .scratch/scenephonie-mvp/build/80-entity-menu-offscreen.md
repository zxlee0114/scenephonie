# 80 — 人物欄、地點欄的選單在視窗下緣被切掉

**What to build:** 實體欄位（`EntityField`：對白人物欄、登場人物欄、地點欄、群演欄）的選單、待確認面板都**無條件開在欄位下方**。
欄位接近視窗底緣時（場次很長、一路往下寫的時候最常見），選單有一半以上落在視窗外，看不到要選的那一列。
下方塞不下就翻到欄位上方，右邊塞不下就往左收。

**Blocked by:** 無

**Status:** needs-triage

## 從哪來的

票 62 瀏覽器驗收時使用者撈到的（2026-10-27），與 62 無關：「場次很長的時候，選單會被遮擋到視窗外」。截圖是對白人物欄拿起
「烏薩奇」時的選單，只露出抬頭那一列。

## 根因

`styles/editor.css` 的 `.entity-field__menu` 與 `.entity-field__confirm` 是 `position: absolute; inset-block-start: calc(100% + …)`，
寫死在欄位下方，沒有任何量測。

## 線索

票 29 為 slash 選單解過同一個問題：`editor/slash-menu-position.ts` 的 `slashMenuPosition(caret, menu, viewport)` 是純函式，
下方不夠且上方夠才翻、右邊不夠往左收，jsdom 量不到排版所以把座標運算獨立出來測。這裡可以拿欄位的 rect 當 `caret` 接同一支
（名字可能要改成不專屬 slash 的）。

## 開工前要定

- 翻到上方時，選單蓋住的是上一句的內容 —— 可以接受，還是寧可把頁面捲上來一點、讓選單留在下方？
- 組字預覽（`--preview`）、待確認面板、命名提示（`--naming`）要不要一起翻？
- 登場人物提示（`.appearing-prompt`，同樣開在台詞底下）是不是同一張票。
