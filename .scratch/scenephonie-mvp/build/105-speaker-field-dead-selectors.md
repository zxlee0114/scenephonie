# 105 — 對白人物欄那幾條樣式對不到元素

**Status:** verified

**What to build:** `editor.css` 裡 `.block--dialogue .block__speaker-field .entity-field` 與它的 `:focus-within`（底線、`--text-base` 字級、次級色、聚焦時底線換色）**一條都沒生效**：`block__speaker-field` 現在直接掛在 `.entity-field` 本身（`editor/nodes/blocks.tsx` 傳 `className="block__speaker-field"`），不是它的父層，descendant 選擇器對不到。畫面上的對白人物欄因此沒有底線、字級是繼承來的。

使用者同意另開，2026-11-05（票 104 實作時撈到）。

**Blocked by:** 無

## 開工前要定

- 這些樣式是要**救回來**（改成 `.block--dialogue .block__speaker-field.entity-field` 之類）還是**刪掉**？對白人物欄的聚焦樣式「維持原狀」是使用者 2026-11-05 的裁決 —— 原狀就是現在這個沒有底線的樣子，救回來等於改外觀，要先問。
- 刪掉的話，周圍註解（「只留一條底線」「底線畫在容器上」）一起改，免得說的跟畫面不一樣。
- 救回來的話，`padding-bottom: 2px`＋底線會讓這一行變高，要跟票 104 的 `min-block-size: 1lh` 一起量，確認點 chip 時仍不位移。

## Comments

**2026-11-05 裁決與實作：** 使用者裁決**刪掉**，不救回來（畫面維持現在沒有底線的樣子）。`editor.css` 刪掉 `.block--dialogue .block__speaker-field .entity-field` 與它的 `:focus-within` 兩條，連同上面那段說「只留一條底線、底線畫在容器上」的註解。全 repo 沒有別的註解再提人物欄的底線。

瀏覽器量過刪除後的對白人物欄：高 31.45px、`border-bottom: none`、內距 0、17px —— 與票 104 量到的刪除前一致；載入的樣式表裡已無含 `.block__speaker-field .entity-field` 的規則，`querySelectorAll` 也是 0。

**2026-11-05 審查回饋與追加裁決：** 刪掉之後看得出來，對白人物欄聚焦時沒有任何樣式（`.block__speaker:focus-visible` 關掉 outline，原本的替代就是這組死規則），牴觸 DESIGN.md「不得移除而不補替代」。在瀏覽器試了聚焦才出現的底線（`box-shadow: inset 0 -1px 0 var(--field-border-focus)`，不佔版面），使用者覺得有違和感，而且台詞、插入畫面也都只靠游標，人物欄多一條線反而不一致。裁決：**不加**，改在 DESIGN.md 的 Focus 段補第二個例外（劇本內文聚焦只靠游標；正在改的那顆 chip 靠邊框換色）。另把兩段不再成立的註解改寫（`.entity-field input:focus`、`.block--dialogue .block__speaker`）。
