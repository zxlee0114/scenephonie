# 04 — 最小編輯器與 CJK 字型載入

**What to build:** 最小可寫作單元 + 螢幕字型。Tiptap 3.30.x + React；場次 + 三種區塊 + 內嵌 chip row（metadata 欄位，可為 null）；建立下一場三入口共用一條路徑（`/next`、⌘+Enter、腳部按鈕）；`Tab`／`Shift+Tab` 環（動作 → 對白 → 插入畫面），**永遠不動容器**；中文 IME —— 組字期間只更新本地狀態、`compositionend` 才回寫；場次號透過 decoration 即時更新。呈現遵 §7.9–7.11：不變式 G（不畫 A4 紙感／分頁線／邊框，場次靠場次標記、gutter、間距建立邊界；場次之外不存在 canonical text insertion point）；chip row 常駐、不可被預設 UI 收合；三種區塊不用顏色區分（改以縮排、欄寬、spacing、閱讀 rhythm）；semantic color token（accent／draft／error／neutral，僅 Light theme，程式碼不得出現 hex）；`--font-body` = self-host Noto Sans TC Regular 400、`--font-ui` = system-ui、只載字重 400；`--text-base` 17px 與 `--leading-base` 1.85（無單位）於此原型實測後定案；內容行長用 `ic`（`em` fallback，先 `34em` 再 `34ic`，靠級聯降級、不需 `@supports`），30–40 全形字是閱讀基準不是統一欄寬。字型載入（票 29）：靜態 105 塊 unicode-range subset（build 期 `fonttools varLib.instancer` 取 `wght=400` → `pyftsubset` 依 Google `css2` 的 105 段切成 woff2 → 手寫 105 個 `@font-face`、`font-display: swap` → `<head>` preload 高頻塊）；**否決動態 subset**；行高寫無單位 `line-height`。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 在瀏覽器打一份多場次劇本，新增場次後後續場次號即時重算
- [ ] Tab 環在任何場次深度都是同三個成員，不生成任何東西；欄位上的 Tab `stopPropagation`
- [ ] 中文注音輸入不掉字、組字期間文件不被回寫；組字期間自動補全選單完全不動作
- [ ] 場次之外不存在可編輯的文字插入點；不畫邊框
- [ ] decoration（場次號）靠 gutter／不進 content flow／不可 select／typography role 浮現
- [ ] `⌘+A` 漸進式全選：區塊 → 本場內文 → 整場 → 整份
- [ ] 105 個 woff2 分塊 + `@font-face`，`font-display: swap`，高頻塊 preload；打字過程新字元不出現空白
- [ ] 所有 UI 色彩走 semantic token、原始碼無 hex；僅 Light theme
- [ ] `--text-base`／`--leading-base` 的定案值與實測理由記錄在 repo
- [ ] 楷體／明體不進螢幕編輯器
