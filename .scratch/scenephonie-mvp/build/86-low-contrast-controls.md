# 86 — 對比不足：場次 sidebar 開關、實體欄 placeholder、hub 卡片摘要

**What to build:** impeccable detector 在瀏覽器裡量到的三處對比（WCAG AA 正文 4.5:1）：

- **`button.scene-nav__toggle`「‹ 場次」2.4:1**（`--text-faint` `#a6a89f` 在白底，13px）—— 這是可操作的按鈕。
  寬版在 `apps/web/src/styles/editor.css` 約 2180 行用 `--text-faint`、hover 才變 `--text-secondary`；
  drawer 收著（約 2366 行）已經改用 `--text-secondary`，**但 drawer 開著那一態「收回去」（約 2380 行）又寫回 `--text-faint`**（grilling 時查到，原票漏了）。
- **實體欄 placeholder「登場人物」「群演」4.3:1** —— `.entity-field input` 沒有設 `::placeholder`，吃到瀏覽器預設
  `#757575`（在 `.entity-field` 底色 `#f7f7f5` 上）。只有 `.entity-field__count-input::placeholder` 設了，而且是 `--text-faint`，更低。
- **`span.hub-card__preview` 2.2:1**（`app.css` 約 287 行，「最多三行，淡字」，`aria-hidden="true"`）—— 刻意做成縮圖，
  但裡面是真的劇本開頭。

**Blocked by:** 無（83 只動 placeholder 的出現時機，不動顏色，互不擋）

**Status:** ready-for-agent

## 定案（使用者 2026-10-28）

實算對比（neutral-400 = `--text-faint`、neutral-600 = `--text-secondary`）：

| 前景 | 白底 | `#f7f7f5` |
|---|---|---|
| neutral-400 | 2.41 | 2.24 |
| neutral-500 | 4.07 | 3.79 |
| 瀏覽器預設 `#757575` | 4.61 | 4.30 |
| neutral-600 | 6.10 | 5.69 |

neutral-500 兩個底都不過 4.5，沒有中間值可用。

- [ ] **範圍只修點名的這幾處**，不動 neutral-400 的值（調深會連場次號這類真 decoration 一起變重）。
  其餘 `--text-faint` 的用處另開 [96](./96-text-faint-audit.md) 盤點。
- [ ] **場次開關三態同一套規則**：寬版、drawer 收著、drawer 開著（「收回去」）—— 靜止 `--text-secondary`，
  hover 字變 `--text-primary`、底 `--surface-raised`。
- [ ] **實體欄 placeholder 用 `--text-secondary`**：`.entity-field input::placeholder` 新增，
  `.entity-field__count-input::placeholder` 從 faint 改過來。不新立 token —— 已填的值是帶框 chip（人物、群演）
  或 `--text-primary`（數量格），不會被讀成「已經填了」。
- [ ] **hub 卡片摘要保留淡字（不改）**：它是 `aria-hidden` 的縮圖，卡片的身分由下面的名字承擔；WCAG 1.4.3 不要求
  incidental text。把這條裁決寫進 `apps/web/.impeccable/config.json`（與 blockquote side-tab 同一處），下次掃描不再報。

## 從哪來的

impeccable critique（2026-10-27）Assessment B 的 overlay 掃描。同一輪判為 false positive 的：flat-type-hierarchy（標題靠字重分層）、
documents.css 的 blockquote side-tab（已在 `.impeccable/config.json` 裁決過）。
