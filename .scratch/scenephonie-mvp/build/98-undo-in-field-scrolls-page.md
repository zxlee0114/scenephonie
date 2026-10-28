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

**Status:** done

## 定案（使用者 2026-10-28）

- [x] **欄位裡的 ⌘Z／⌘⇧Z 不捲動**：`forwardHistoryKey` 改用 prosemirror-history 的 `undoNoScroll`／`redoNoScroll`。
  在欄位裡按的這一下，編劇看的是這一欄；撤的若是別場的字，畫面不會跟過去 —— 回到內文再按 ⌘Z 就照常捲。
  不做「撤銷落在別場才捲」：要先判斷那一步改到哪裡，複雜度不值得。
- `strayHistoryKey`（焦點掉到 body 那一格）不在這張票：那一下不是從欄位裡按的。

## 從哪來的

票券 97 驗收（2026-10-28）。
