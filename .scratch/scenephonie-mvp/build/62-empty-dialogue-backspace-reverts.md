# 62 — 空的對白（人物欄與台詞都空）按 Backspace 不會收回區塊

**What to build:** 一句對白人物欄與台詞都是空的，在裡面按 Backspace **什麼都沒發生**。編劇預期
這一下把這個對白區塊收掉。

已經有的對應手勢：空的對白按 **Enter** ＝ 取消型別、退回描述（`extensions/continue-block.ts`，
`isBlankBlock`，使用者回饋 2026-09-03 第四輪）。開工前要問：Backspace 是

1. 同 Enter：退回描述（action），區塊還在；還是
2. 整個區塊拿掉、游標回上一個區塊尾端（一般文字編輯器對空段落 Backspace 的樣子）。

也要確認 Backspace 是在**哪一格**按的：台詞空的內文裡，還是人物欄的空輸入框裡（後者的 Backspace
現在歸欄位 —— 拿游標左邊那一顆 chip，見 CONTEXT.md「chip 之間那道縫」）。兩處可能都要接。

**Status:** open

## 從哪來的

票券 10 瀏覽器驗收時使用者撈到的（2026-09-29），與 10 無關。

- [ ] 人物欄與台詞都空的對白按 Backspace 會收回（行為開工前定）
- [ ] 有人物、沒台詞的對白按 Backspace 不受影響（那不是空的，見 `isBlankBlock`）
