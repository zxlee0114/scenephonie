# 96 — `--text-faint` 盤點：只留給 decoration

**What to build:** `tokens.css` 把 `--text-faint`（neutral-400，白底 2.41:1、`#f7f7f5` 底 2.24:1）定義為
**decoration（場次號等）的 typography role**：「低對比只是輔助支撐，主要靠位置與 interaction boundary」
（`research/ui-tokens-draft.md` 第 82 行）。但現在全站約 45 處用它（`editor.css`、`app.css`、`documents.css`、`share.css`），
顯然不全是 decoration。

逐處判：

- **decoration**（不可編輯、不可選取、靠位置說話的，如場次號）→ 留 faint。
- **可操作的元素**、或**要人讀的正文／說明**→ 改 `--text-secondary` 以上。
- 拿不準的列出來問。

neutral-400 的值本身不動（86 裁決）。

**Blocked by:** [86](./86-low-contrast-controls.md)（86 先把點名的三處修掉，這張不重複）

**Status:** needs-triage

## 從哪來的

票券 86 grilling（2026-10-28）：86 只修 impeccable 量到的那幾處，「faint 被拿去做不是 decoration 的事」這個根因拆到這裡。

## Comments

**2026-11-03，DESIGN.md**：判準已寫成 [`apps/web/DESIGN.md`](../../../apps/web/DESIGN.md) 的 **The Faint Is Decoration Rule**，逐處判時以它為準（試金石：「拿掉這段字，使用者會少知道一件他需要的事嗎？」會 → 不是 decoration）。例外仍只有 hub 卡片摘要。

併進本票（DESIGN.md 撈到，不是 `--text-faint` 但同屬「狀態文字對比」）：

- [ ] **手動草稿標籤 4.27:1**：`.scene--draft-manual` 的標籤是 `--draft-fg`（#8a6a20）在 `--draft-bg`（#f3ecd7）上、13px，低於 AA 4.5:1（白底的自動草稿是 5.04:1，過）。草稿標籤要說「這場會擋你匯出」，帶狀態語意，不屬可豁免的 decoration。修法要先問：調淡底、調深字，或換別的手段標示「手動」。
