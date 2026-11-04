# 105 — 對白人物欄那幾條樣式對不到元素

**Status:** needs-triage

**What to build:** `editor.css` 裡 `.block--dialogue .block__speaker-field .entity-field` 與它的 `:focus-within`（底線、`--text-base` 字級、次級色、聚焦時底線換色）**一條都沒生效**：`block__speaker-field` 現在直接掛在 `.entity-field` 本身（`editor/nodes/blocks.tsx` 傳 `className="block__speaker-field"`），不是它的父層，descendant 選擇器對不到。畫面上的對白人物欄因此沒有底線、字級是繼承來的。

使用者同意另開，2026-11-05（票 104 實作時撈到）。

**Blocked by:** 無

## 開工前要定

- 這些樣式是要**救回來**（改成 `.block--dialogue .block__speaker-field.entity-field` 之類）還是**刪掉**？對白人物欄的聚焦樣式「維持原狀」是使用者 2026-11-05 的裁決 —— 原狀就是現在這個沒有底線的樣子，救回來等於改外觀，要先問。
- 刪掉的話，周圍註解（「只留一條底線」「底線畫在容器上」）一起改，免得說的跟畫面不一樣。
- 救回來的話，`padding-bottom: 2px`＋底線會讓這一行變高，要跟票 104 的 `min-block-size: 1lh` 一起量，確認點 chip 時仍不位移。

## Comments
