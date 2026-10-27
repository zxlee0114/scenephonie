# 86 — 對比不足：場次 sidebar 開關、實體欄 placeholder、hub 卡片摘要

**What to build:** impeccable detector 在瀏覽器裡量到的三處對比（WCAG AA 正文 4.5:1）：

- [ ] **`button.scene-nav__toggle`「‹ 場次」2.4:1**（`--text-faint` `#a6a89f` 在白底，13px）—— 這是可操作的按鈕。
  寬版在 `apps/web/src/styles/editor.css` 約 2180 行用 `--text-faint`、hover 才變 `--text-secondary`；
  drawer 版（約 2366 行）已經改用 `--text-secondary`，寬版沒跟上。
- [ ] **實體欄 placeholder「登場人物」「群演」4.3:1** —— `.entity-field input` 沒有設 `::placeholder`，吃到瀏覽器預設
  `#757575`（在 `.entity-field` 底色 `#f7f7f5` 上）。只有 `.entity-field__count-input::placeholder` 設了，而且是 `--text-faint`，更低。
- [ ] **`span.hub-card__preview` 2.2:1**（`app.css` 約 287 行，「最多三行，淡字」，`aria-hidden="true"`）—— 刻意做成縮圖，
  但裡面是真的劇本開頭。**要不要動由驗收決定**：保留淡字也是一個合理答案。

**Blocked by:** 無（若做 83，抬頭收合後 placeholder 的出現時機會變，可一起看）

**Status:** needs-triage

## 從哪來的

impeccable critique（2026-10-27）Assessment B 的 overlay 掃描。同一輪判為 false positive 的：flat-type-hierarchy（標題靠字重分層）、
documents.css 的 blockquote side-tab（已在 `.impeccable/config.json` 裁決過）。
