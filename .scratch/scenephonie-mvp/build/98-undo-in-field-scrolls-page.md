# 98 — 在實體欄位按 ⌘Z，頁面有時會捲到奇怪的地方

**What to build:** 在實體欄位撤掉剛定案的那一筆（例：地點欄打「巷口、警局」→ Enter → ⌘Z），視窗有時會突然捲動。
字有回到框裡（97 已修），但畫面跳走了。

**還沒定位，先記線索：**

- chip row 的 ⌘Z 走 `forwardHistoryKey`（`apps/web/src/editor/history-keys.ts`）→ `editor.commands.undo()`。
  prosemirror-history 1.5.0 的 undo 會 `tr.scrollIntoView()`（`dist/index.js` 第 408 行），捲到**撤銷後 ProseMirror 的 selection**。
- 欄位定案走 command-bridge，`keepCaret` 時不動 doc 的 selection —— 所以 doc 的游標可能停在離這一場很遠的地方，
  undo 一 `scrollIntoView` 就捲過去。這解釋了「有時」：要看 doc 的游標當時在哪。
- 待查：是不是 82 起就在（97 只動了欄位等待的判準，不碰捲動，推測不是 97 造成的，未驗證）。

**Blocked by:** 無

**Status:** needs-triage

## 從哪來的

票券 97 驗收（2026-10-28）。
