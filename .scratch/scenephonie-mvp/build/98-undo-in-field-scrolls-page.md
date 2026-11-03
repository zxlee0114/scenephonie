# 98 — 在實體欄位按 ⌘Z，頁面有時會捲到奇怪的地方

**What to build:** 在實體欄位撤掉剛定案的那一筆（例：地點欄打「巷口、警局」→ Enter → ⌘Z），視窗有時會突然捲動。
字有回到框裡（97 已修），但畫面跳走了。

**定位（2026-10-28，瀏覽器實測）：** 示範劇本第 1 場登場人物欄打「測試甲」→ Enter → ⌘Z，文件游標停在第 3 場最後一行，
視窗 `scrollY` 0 → 838。唯一一次捲動：`scrollBy [0, 837.6]` ← `scrollRectIntoView` ← `EditorView.scrollToSelection` ← `dispatchTransaction`。

- chip row 的 ⌘Z 走 `forwardHistoryKey`（`apps/web/src/editor/history-keys.ts`）→ `editor.commands.undo()`。
  prosemirror-history 1.5.0 的 undo 會 `tr.scrollIntoView()`（`dist/index.js` 第 408 行），捲到**撤銷後 ProseMirror 的 selection**。
- 欄位定案走 command-bridge，`keepCaret` 時不動 doc 的 selection —— 所以 doc 的游標可能停在離這一場很遠的地方，
  undo 一 `scrollIntoView` 就捲過去。這解釋了「有時」：要看 doc 的游標當時在哪。
- 不是 97 造成的：捲動來自 undo transaction 本身，與欄位等待的判準無關。

**Blocked by:** 無

**Status:** verified

## 定案（使用者 2026-11-03，改寫 2026-10-28 那一版）

第一版是「欄位裡的 ⌘Z 不捲」。驗收時撈到同一個根因的另一個入口：撤掉第 1 場的 chip、把第 1 場捲出畫面、
點空白處（焦點掉到 body，走 `strayHistoryKey`）再按 ⌘Z —— 畫面捲動了，卻捲到文件游標，不是改動的位置。
使用者也改要「撤到別場時畫面要跟過去」。

- [x] **畫面跟著那一步走，不跟著文件游標走**：撤銷／重做都不帶 `scrollIntoView`，改拿前後兩份文件比
  （`findDiffStart`）出改到哪裡 —— 已經在畫面上就不動；不在，就捲過去、停在畫面中段（`anchor: 0.5`）。
- [x] **三個入口一條規則**：欄位裡（`forwardHistoryKey`）、焦點掉到 body（`strayHistoryKey`）、內文
  （接手 StarterKit `undoRedo` 的 `Mod-z`／`Shift-Mod-z`／`Mod-y` 與俄文鍵盤那兩格）都走 `runHistory`。
- 沒接的：瀏覽器選單「編輯 → 還原」（`beforeinput` 的 `historyUndo`）仍走 prosemirror-history 自己那條、會捲到游標。
  沒人回報，先不動。

## 從哪來的

票券 97 驗收（2026-10-28）。
