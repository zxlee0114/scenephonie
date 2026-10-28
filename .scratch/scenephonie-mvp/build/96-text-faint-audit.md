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
