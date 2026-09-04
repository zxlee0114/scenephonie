# 28 — 軟換行後游標回到第一行（bug）

**症狀：** 在區塊內按 `Shift+Enter` 換到第二行，接著打字，字出現在**第一行**的結尾，不是第二行。

**Blocked by:** 04（`extensions/soft-break` 在該票交付）

**Status:** ready-for-agent

## 已知的事實（不必重驗）

- **資料模型是對的。** `keyboard-feedback.test.ts` 驗過 `Shift+Enter` 插入的是單一 `\n` 文字字元、經 `docFromJSON` 往返後仍是同一個 `text` 節點。壞掉的是**渲染與 caret 位置**，不是存下來的東西。
- 既有測試只涵蓋 `\n` 夾在文字**中間**的情形（`走進門\n關上門`）。`\n` 在區塊**結尾**的情形沒有任何測試 —— 而那正是「按下 `Shift+Enter` 之後、還沒開始打字」的當下狀態。

## 假設（開工前先證實或推翻）

軟換行走的是「插入 `\n` 文字 ＋ CSS `white-space: pre-wrap`」（`extensions/soft-break.ts` 刻意不用 `hardBreak` 節點，理由見該檔註解）。但**位於區塊結尾的 `\n` 在瀏覽器裡不會產生一個可見的空行** —— pre-wrap 不為區塊末端的斷行留下行框。於是視覺上 caret 停在第一行末，接著輸入時 DOM selection 被映射回 `\n` 之前的位置，字就落在第一行。

這個假設可以用一個 jsdom 測試以外的方式驗（jsdom 沒有真正的排版）：在瀏覽器裡打 `abc` → `Shift+Enter` → 檢查 `editor.state.selection.from` 是否確實在 `\n` 之後，以及該位置的 DOM coords。

## 兩條候選解法（需要決定）

**A. 用 `hardBreak` 節點（`<br>`）。** ProseMirror 的標準做法，瀏覽器行為正確。代價是 kernel schema 要多一個節點型別 —— 票券 04 明確拒絕過（會撐破 `schema-equivalence.test.ts` 與 §5.3 的 null 鐵律），而且它會進入 PDF 匯出、場次表推導等所有下游。**要走這條就得先回到票券 02 的 schema 決策。**

**B. 保留 `\n`，在 node view 補一個尾端 `<br>` 守衛。** 資料模型不動（這是票券 04 選 `\n` 的初衷）。代價是 node view 要在「區塊文字以 `\n` 結尾」時多渲染一個不進 content flow 的 `<br>`，而 `NodeViewContent` 的內容由 ProseMirror 管，插入額外 DOM 需要小心不要讓 PM 的位置映射錯亂。

傾向 B（守住票券 04 的資料模型決策），但需要先做一次小 spike 確認 PM 的位置映射不會被打壞；若 B 不可行就把問題升級回票券 02。

## 影響檔案

- `apps/web/src/editor/extensions/soft-break.ts`
- `apps/web/src/editor/nodes/blocks.tsx` —— `NodeViewContent` 所在
- `apps/web/src/styles/editor.css` —— `.ProseMirror { white-space: pre-wrap }`（第 107 行附近）
- `apps/web/src/editor/keyboard-feedback.test.ts` —— 補「`\n` 在區塊結尾」的案例

## 驗收

- [ ] 打字 → `Shift+Enter` → 打字，第二段文字出現在**第二行**
- [ ] `Shift+Enter` 之後、還沒打字時，看得見一個空的第二行，且 caret 在那一行上
- [ ] 連續兩次 `Shift+Enter` 產生兩個空行，行為一致
- [ ] `\n` 仍以單一 `text` 節點進入 canonical document（既有的往返測試不回歸），kernel schema 未新增節點型別（若最終走 A 則此條改寫並回到票券 02）
- [ ] 存檔 → 重整後軟換行仍在正確的位置（跨 persistence 往返）
- [ ] `pnpm lint` / `typecheck` / `test` / `build` 全綠

## Comments

**開票（2026-09-04）** —— 票券 05 的本機驗收中由使用者回報（先前已提過一次）：「軟換行 shift + enter 到第二行時，重新打字會回到第一行」。診斷寫在上面的「已知的事實」與「假設」兩節。
