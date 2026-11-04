# 104 — 點對白的人物 chip 開選單時，版面會位移

**Status:** done

**What to build:** 點對白區塊的人物 chip（例如 `👤 阿盈`）時，下拉選單展開的那一下，周圍版面會跳一點。選單是浮層（`position: fixed`，走 The One Placement Rule），照理不該推動任何東西 —— 找出是什麼在變尺寸並讓它不動。

使用者回報，2026-11-05（票 101 驗收時順手發現）。

**Blocked by:** 無

## 開工前要查

- 位移是誰造成的：chip 換成輸入框（`.entity-field__input-chip`／`--inline`）時寬高不一致？聚焦時多了框線或內距？還是選單本身沒有脫離文件流？
- 抬頭欄位已經處理過同類問題（輸入框寬度固定、只是游標時寬度固定，2026-09-11 驗收回饋）—— 對白人物欄是不是少套了那幾條。
- 對白人物欄的聚焦樣式維持原狀（使用者裁決 2026-11-05），修位移時不要順手改它。

## Comments

**2026-11-05 實作：** 位移是**整行塌高**，不是選單。對白人物欄（`.entity-field.block__speaker-field`）平常的行高由隊尾輸入框撐開（頁面行高 31.45px）；點 chip 開始改時輸入框搬進 `.entity-field__input-chip`（`line-height: 1.4`，25.8px），隊尾沒東西了，整行塌掉 5.65px —— chip 往上跳 2.8px、台詞與底下整頁往上縮。選單本身是 `position: fixed`，沒有參與。

修法：`.block--dialogue .block__speaker-field` 加 `min-block-size: 1lh`。在瀏覽器量過點之前、編輯中、失焦後三個時間點：欄位 31.45px、chip 位置、整個對白區塊高度都一致。

順帶發現（沒動）：`.block--dialogue .block__speaker-field .entity-field` 那幾條（底線、字級、`:focus-within` 換底線色）選擇器已經對不到 —— `block__speaker-field` 現在直接掛在 `.entity-field` 本身，不是它的父層。聚焦樣式依裁決維持原狀，所以沒改。
