---
name: Scenephonie
description: 台灣影視編劇的結構化劇本編輯器 —— 為一個人連續寫八小時而設計。
colors:
  neutral-0: "#ffffff"
  neutral-50: "#f7f7f5"
  neutral-100: "#eeeeeb"
  neutral-200: "#e2e3df"
  neutral-300: "#cdcec8"
  neutral-400: "#a6a89f"
  neutral-500: "#7d7f75"
  neutral-600: "#61635a"
  neutral-700: "#474840"
  neutral-800: "#333430"
  neutral-900: "#23241f"
  accent: "#2f6087"
  accent-hover: "#244d6d"
  accent-weak: "#e3edf4"
  draft: "#8a6a20"
  draft-weak: "#f3ecd7"
  error: "#b23a2c"
  error-weak: "#f6e3e0"
typography:
  screenplay-body:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
  doc-title:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "1.75em"
    fontWeight: 700
    lineHeight: 1.5
  doc-heading:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "1.35em"
    fontWeight: 700
    lineHeight: 1.5
  doc-subheading:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "1.1em"
    fontWeight: 700
    lineHeight: 1.5
  ui-title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Noto Sans TC, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  ui-label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Noto Sans TC, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  gutter: "4rem"
  bar-height: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.neutral-0}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.neutral-0}"
  button-secondary:
    backgroundColor: "{colors.neutral-0}"
    textColor: "{colors.neutral-700}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.neutral-0}"
    textColor: "{colors.error}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input-text:
    backgroundColor: "{colors.neutral-0}"
    textColor: "{colors.neutral-900}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  menu:
    backgroundColor: "{colors.neutral-0}"
    textColor: "{colors.neutral-900}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.md}"
    padding: "4px"
  menu-item:
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  menu-item-active:
    backgroundColor: "{colors.accent-weak}"
  dialog:
    backgroundColor: "{colors.neutral-0}"
    textColor: "{colors.neutral-900}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.lg}"
    padding: "24px"
    width: "min(28rem, 100%)"
  header-bar:
    backgroundColor: "{colors.neutral-0}"
    height: "{spacing.bar-height}"
    padding: "0 24px"
  scene-nav-row-current:
    backgroundColor: "{colors.accent-weak}"
    textColor: "{colors.neutral-900}"
---

# Design System: Scenephonie

> **這份檔案記錄現況並補上規則，不是重新設計。** 色值、字級與間距的唯一來源是
> [`src/styles/tokens.css`](./src/styles/tokens.css)；上面的 frontmatter 是它的鏡像，兩者不一致時以 tokens.css 為準、
> 並回頭修這份檔案。每個值背後的理由住在
> [`research/ui-tokens-draft.md`](../../.scratch/scenephonie-mvp/research/ui-tokens-draft.md)、規格 §7.9–7.12、
> [`docs/editor-typography.md`](../../docs/editor-typography.md) 與 [ADR-0010](../../docs/adr/0010-editor-representation-is-not-output-preview.md)；
> 這裡只寫「怎麼用」，不重抄「為什麼」。產品脈絡見 [PRODUCT.md](./PRODUCT.md)。

## Overview

**Creative North Star: 「第八個小時」**

每一個視覺決定都先問同一句話：**編劇連續寫到第八個小時，這個東西還受得了嗎？** 這把尺不量一屏塞了多少，量的是疲勞度。它跟不變式 G 一樣可否證 —— 一塊常駐的淡底、一顆搶眼的按鈕、一個每場都在的框，都可以拿這句話判對錯。Surface mode 是 **Operate**：熟悉的介面慣例有它的位置，表現力只出現在精準的細節裡。

這套系統有兩種 typographic role，而且刻意分開：**介面像作業系統，內容像稿子。** 按鈕、選單、場次表、decoration 用 system-ui，小、輕、退到邊上；劇本與散文文件用 Noto Sans TC，大一級、行距鬆、行長收在 30–40 個全形字。畫面以近白的中性色為主調，只有四個色彩角色（accent、draft、error、neutral），每一個都有它自己的判準。結構邊界靠**位置與間距**建立，不靠描繪：場次不畫框，decoration 住在左側 gutter、不進 content flow。

參照 **Ulysses 的沉靜**，借 **Notion 的區塊語意**，刻意不像 **Final Draft 的版面權威**（A4 紙感、分頁線、標楷體、12 級字）與 **Scrivener 的窗格密度**。編輯器不是 PDF 預覽 —— PDF 匯出版面是另一套模板，不在這份檔案的範圍內。

**Key Characteristics:**
- 近白中性底、微偏冷的低彩度灰；色彩只在有語意的地方出現。
- 兩套字體各司其職：內容 Noto Sans TC 400（17px／1.85），介面 system-ui。
- 偏鬆的密度與 4px 為底的間距節奏；劇本左側固定 4rem gutter。
- 平面為主，只有一種陰影，留給浮在稿子上的東西。
- 一個畫面至多一顆主要按鈕；危險動作用 error 色但永不實心。
- 繁體中文介面，劇組語言。

## Colors

一組近乎無聲的中性灰，加上三個各自有語意、彼此不能互換的顏色。

### Primary
- **沉靜藍 Quiet Ink Blue**（`accent`）：可點擊、選取、focus。主要按鈕的底、tab 與目前視圖的指示、focus ring（`--focus-ring`）。依自身語意設計，**不從 brand color 衍生**（v1 沒有 brand color）。白底對比 6.68:1。
- **深一階 Deep Ink Blue**（`accent-hover`）：主要按鈕的 hover。
- **藍霧 Blue Mist**（`accent-weak`）：選取底（`--selection-bg`）—— 選單的 active 列、sidebar 的目前場次、節點選取、剛新增的場次閃一下。它是動作回饋，**不是常駐的面**。

### Secondary
- **赭黃 Muted Ochre**（`draft`）：草稿場次的標籤與 sidebar 的草稿場次號（`--draft-fg`）。**document state**：常駐、大量，判準是不疲勞。白底 5.04:1。
- **淡赭 Ochre Wash**（`draft-weak`）：只給**手動標記**的草稿標籤一層淡底（`--draft-bg`）；自動草稿只換字色。

### Tertiary
- **清楚的紅 Plain Signal Red**（`error`）：`--error-fg`。**action consequence**：可以刺眼。白底 5.94:1。
- **淡紅 Signal Wash**（`error-weak`）：`--error-bg`，錯誤訊息與匯出防呆清單的底。

### Neutral
- **紙白 White**（`neutral-0`）：頁面底（`--surface-page`）、對話框與選單的底、accent 上的字（`--text-on-accent`）。
- **霧白 Fog**（`neutral-50`）：`--surface-raised`，hover 底、唯讀欄位底、chip row 底。
- **石灰 Lime Wash**（`neutral-100`）：`--surface-sunken`。
- **細線灰 Hairline**（`neutral-200`）：`--rule`，header 下緣、文件頁標題下的那一條線。
- **框線灰 Frame**（`neutral-300`）：`--rule-strong` 與 `--control-border`，選單、對話框與次要按鈕的框。
- **淡灰 Faint**（`neutral-400`）：`--text-faint`，**只給 decoration**（見下方規則）。白底 2.41:1，不過 AA。
- `neutral-500`：目前沒有 semantic 消費者 —— 白底 4.07:1，兩個底都不過 4.5，不是「中間值」（票 86 實算）。
- **石墨 Graphite**（`neutral-600`）：`--text-secondary`，說明文字、次要標籤、可操作元件靜止態、placeholder。白底 6.10:1。
- **控制灰 Control**（`neutral-700`）：`--control-fg`，次要按鈕與欄位裡已輸入的字。
- `neutral-800`：目前沒有 semantic 消費者。
- **墨 Ink**（`neutral-900`）：`--text-primary`，正文與標題；也是 favicon 容器色。白底 15.63:1。

### Named Rules

**The Semantic Token Rule.** 原始碼裡不得出現 hex；色彩的原始值只住在 `tokens.css` 的 primitive 層，其他一切用 semantic token。v1 只有 Light theme；深色是換 primitive 的值，semantic 層不動。

**The Faint Is Decoration Rule.**（票 86 定、票 96 盤點）`--text-faint` **只給裝飾性文字**：不可編輯、不可選取、靠位置說話的東西，例如 gutter 裡的場次號、分隔用的 `/`。**可操作的元件**（按鈕、開關、觸發鈕，包括它們的靜止態）與 **placeholder** 一律 `--text-secondary` 以上；要人讀的說明與正文也是。判斷不了時的試金石：「拿掉這段字，使用者會少知道一件他需要的事嗎？」會 → 不是 decoration。唯一經過裁決的例外是 hub 卡片摘要（`aria-hidden` 的劇本開頭縮圖，卡片身分由下方名稱承擔，見票 86 與 repo 根目錄 `.impeccable/config.json`）。其餘既有用法由票 96 逐處判，這份檔案不逐處判決。**不要為了救對比去調深 neutral-400** —— 那會讓真的 decoration 一起變重。

**The Two Reds Are Not One Rule.** draft 與 error 不同色，不是因為撞色，是因為**語意不在同一層**：draft 是文件狀態（判準：不疲勞），error 是動作後果（判準：可以刺眼）。不要拿 draft 表示「警告」，也不要拿 error 表示「還沒填」。v1 沒有 `warning` 與 `success` 角色 —— 交付狀態用文字說。

**The Error Has Two Consumers Rule.** error 色只有兩個合法的消費者：①**匯出前防呆**（匯出對話框裡的錯誤態）與表單驗證錯誤；②**危險動作**（見 Components → Buttons）。（規格 §7.11 原本寫「只在匯出彈窗出現」，2026-11-03 已隨這條規則改寫；`tokens.css` 檔頭註解仍是舊說法，下次動該檔時一起改。）必填星號**不是**錯誤，不該用 error 色（票 88）。

**The No Color for Content Rule.** 三種區塊型別（動作／對白／插入畫面）是**內容**，不上色；用縮排、欄寬、間距與閱讀節奏區分。上色等於重建「格式即內容」的暗示。

## Typography

**Body Font:** Noto Sans TC（self-host，fallback `PingFang TC`、`Microsoft JhengHei`、`Heiti TC`、`sans-serif`）
**UI Font:** system-ui（`-apple-system`、`Segoe UI`、`Noto Sans TC`、`sans-serif`）
**Brand（只在 wordmark）:** Source Sans 3，轉成 SVG outline，不在 CSS runtime 排。

**Character:** 內容用一套穩重、筆畫清楚的繁中黑體，介面借作業系統自己的字；兩者的分工比字體本身更重要 —— family 只是目前實現 role 區分的手段，不是不變式。

### Hierarchy
- **劇本正文** (400, 17px, 1.85)：動作、對白、插入畫面。行長 36 全形字（`--measure-body-ic`），對白 26 全形字（`--measure-dialogue-ic`）；以 `ic` 表達、`em` 作 fallback（先寫 `34em` 再寫 `34ic`，靠級聯降級）。30–40 是**閱讀基準，不是統一欄寬**。17px 與 1.85 是工作值，等真實劇本語料回頭量。
- **散文文件標題** (700, 1.75em, 1.5)：文件頁的文件名稱，即第一層標題。
- **散文文件 H2／H3** (700, 1.35em／1.1em, 1.5)：故事大綱、分場大綱、自由文件裡作者寫的標題。
- **介面標題** (600, 1rem, 1.5)：對話框標題、精靈標題。匯出對話框目前用 `--text-base`。
- **介面標籤** (400／600, 0.8125rem = 13px, 1.5)：按鈕、選單、chip row、sidebar、場次表、說明文字。全站最常用的字級（`--text-sm`）。

### Named Rules

**The Regular Only Rule.** 劇本頁只載 Noto Sans TC **Regular 400**。字重不得表達劇本的內容語意（粗體已從劇本的資料模型拿掉）；場次標題的層級靠字級、間距與結構位置。700 只給散文文件，由文件頁掛上、劇本頁載不到。介面的 system-ui 字重免費、可用 600。

**The No Output Typography Rule.** 楷體、明體、12 級字、TNUA 的 12pt／16pt 都屬 PDF 那一套，**不進螢幕**，fallback 鏈也刻意不含它們。

**The Unitless Leading Rule.** 內容的行高一律寫無單位比值（`--leading-base`、`--leading-sm`），不寫 `normal`、不用 `ascent-override` 或 `size-adjust`：字型換手時行高才不跳、`ic` 欄寬才不壞。

## Layout

- **頁面殼**：頂端一條 48px（`--bar-height`）的 sticky header，`--surface-page` 底、下緣一條 `--rule`、左右 padding 24px。header 右端依序住匯出、分享、快捷鍵等觸發鈕與存檔狀態；它們用 `--bar-height` 對齊。
- **劇本欄**：置中、`max-inline-size: 36ic + 4rem`。左側 4rem 是 **gutter**，場次號、子場次號、草稿標籤、拖曳把手住在這裡，不進 content flow、不可選取。子場次以一條細直線串在主場次內容邊，內容略縮一階。
- **場次邊界**：靠場次標記、gutter 與場次間距，**不畫框**。場次之外沒有可以打字的地方。最後一場下方固定一顆 append 按鈕（真實 `<button>`、進 Tab 序）；場次之間的 insertion zone 只在 hover／focus 出現、不進 Tab 序。
- **文件頁**：同樣 36ic 欄寬，上 32px、左右 24px，底部 40vh 留白讓最後一行能捲到視窗中段。
- **場次導覽 sidebar**：可收合、預設展開、狀態持久化。一列四格固定欄寬（場次號 4.5em｜內外 2em｜時間 1em｜地點 1fr），行高 1.75，130 場也掃得過去。
- **間距節奏**：4／8／12／16／24／32px（`--space-1`～`--space-6`），偏鬆。不另立 magic number；需要新值時先問是不是哪個既有 token 的推導。
- **斷點**：`64rem`（以上 sidebar 常駐並把稿子推開；以下改成 drawer，判斷在 `scene-nav/use-scene-nav-open.ts`）；`640px`（hub 卡片改格線、建立精靈縮內距）。390px 的抬頭排列尚待實機（票 88）。
- **疊層順序（z-index）**：內容內局部 1–5 ｜ sticky header 10 ｜ 錨定浮層（選單、chip 選單、實體欄選單、待確認面板、toast）20 ｜ sidebar drawer、懸停提示 25 ｜ header 上的觸發鈕、存檔狀態、欄位說明面板、拖曳指示 30 ｜ 模態對話框的 scrim 40。新元件找一層放進去，不要發明 21、35 這種中間值。

## Elevation & Depth

平面為主。深度靠**色調分層**（`--surface-page` → `--surface-raised` → `--surface-sunken`）與細線，而不是陰影。整套系統只有**一種陰影**，留給浮在稿子上方、暫時出現的東西。

### Shadow Vocabulary
- **浮層 Popover**（`box-shadow: 0 4px 16px` neutral-900 @ 8%，`--shadow-popover`）：選單、slash 選單、欄位說明面板、場次預覽、對話框、toast、drawer。永遠搭配 1px `--rule-strong` 框線一起出現。

### Named Rules

**The One Shadow Rule.** 只有 `--shadow-popover`。不加第二種陰影、不做 hover 浮起、不用陰影區分卡片層級。靜止的內容沒有陰影；有陰影就代表它是暫時的、會關掉的。

**The Scrim Rule.** 模態對話框的遮罩是 `--surface-page` 72% 混透明（`color-mix`），讓稿子淡下去而不是變暗；不用黑色半透明遮罩。

## Shapes

小而克制的圓角，從間距 token 推導：**4px**（`--space-1`）給按鈕內的選單列、輸入框、chip、小按鈕；**8px**（`--space-2`）給選單、主要與次要按鈕；**12px**（`--space-3`）給對話框與大面板。框線一律 1px：`--rule` 用於分隔，`--rule-strong`／`--control-border` 用於元件邊框。

**The No Frame Rule.** 場次、區塊、對白都不畫邊框，也不畫三角形或框框 —— 那是 GHSA 2022 改版拿掉的東西，畫回來就違反不變式 G。結構提示只能是線段（子場次那條直線）、位置與間距；選取與剛新增的回饋用 `--selection-bg` 的**暫時**底色，不是常駐邊框。

## Components

### Buttons

安靜、平的、靠字與框說話；只有主要動作有顏色。

- **Primary**（`button-primary`）：實心 `accent` 底、`--text-on-accent` 字、600、13px、8px 圓角、padding 8px 16px；hover 轉 `accent-hover`。現況：儀表板「建立專案」、建立精靈主按鈕。
- **Secondary**（`button-secondary`）：白底、1px `--control-border` 框、`--control-fg` 字、同尺寸；hover 框轉 `--rule-strong`、字轉 `--text-primary`。
- **Danger**（`button-danger`）：白底、1px `--error-fg` 框、`--error-fg` 字。**永不實心。**
- **Header 觸發鈕**（匯出、分享、快捷鍵、場次開關）：無框、無底、`--text-secondary` 字，hover 轉 `--text-primary`（場次開關另加 `--surface-raised` 底）。靜止態也不得用 `--text-faint`。
- **Disabled**：`opacity: 0.5`–`0.6`、`cursor: default`。需要點了才能告訴使用者「還差什麼」時用 `aria-disabled`，不用 `disabled`。
- **Focus**：`outline: 2px solid var(--focus-ring)`、`outline-offset: 2px`。全站一致，不得移除而不補替代。

**The One Primary Rule.** 主要按鈕**只有一種樣式**（上面那一個），**一個畫面或一個對話框至多一顆**。對話框裡的「匯出」、「建立」、「下一步」就是那一顆；「關閉」「取消」「返回」永遠是 secondary。不得用「深色框＋600 字」或其他變體充當主要按鈕。⚠️ 現況不符：匯出對話框的送出鈕是深色外框（`.export-pdf__actions button:last-child`）、分享面板全是細框同重 —— 實作歸票 88。

**The Danger Is Set Apart Rule.** 危險動作（刪除本場、停用分享連結、刪除專案……會讓東西消失或讓別人手上的連結失效的）：
- 按鈕用 Danger 樣式；**選單裡**是 `--error-fg` 字的列，放在**最後一區**、上方一條 `--rule` 分隔線，不跟常用動作相鄰。
- 在一列按鈕裡，危險動作與其他動作拉開距離（另一側或中間加 spacer），不與主要按鈕並排同重。
- 不可逆的，第二步要確認；確認框裡那顆仍是 Danger 樣式，不改成實心紅。
- ⚠️ 現況不符：場次選單「刪除本場」緊貼「標記為草稿」、無分隔無危險樣式（票 68／88）；分享面板「停用」與「複製」並排同重（票 88）。

### Inputs / Fields
- **Style**：白底、1px `--control-border`、4px 圓角、padding 8px 12px，字 `--text-primary`；標籤 13px 600、在欄位上方。
- **Placeholder**：`--text-secondary`（不是 `--text-faint`，也不吃瀏覽器預設）。
- **Read-only**：`--surface-raised` 底、`--text-secondary` 字。
- **Focus**：2px `--focus-ring` outline，offset 2px。
- **Error**：框轉 `--error-fg`；沒填的提示寫在 placeholder 裡、也轉 `--error-fg`（版面不跳），不在欄位下方另起一行。

### Menus & Overlays

選單（場次選單、slash 選單、卡片選單、chip 選單、實體欄選單）共用一個形狀：白底、1px `--rule-strong` 框、8px 圓角、`--shadow-popover`、內距 4px、system-ui 13px。列是 4px 圓角、padding 8px 12px，active／hover 用 `--selection-bg`。太長就限高（slash 選單 `min(22rem, 60vh)`）自己捲、`overscroll-behavior: contain`。

**The One Placement Rule.** 所有**錨定在某個點上的浮層**（選單、欄位說明面板、實體欄選單、待確認面板、組字預覽、命名提示、登場人物提示）都走**同一支定位函式** —— [`src/editor/anchored-position.ts`](./src/editor/anchored-position.ts)（座標運算）與 [`src/editor/use-anchored-position.ts`](./src/editor/use-anchored-position.ts)（量尺寸、跟著捲動重算）；票 33 從 slash 選單專用的 `slash-menu-position.ts` 改名搬家而來。**不准寫第二套**：
1. 預設開在錨點**下方**、間隔 6px，**貼齊錨點起始邊**。
2. 下方放不下、且上方有空間 → **翻到上方**。翻上去蓋住上一句可以接受：浮層是暫時的。
3. 上下都放不下 → **不往回推**（那會蓋住錨點本身，也就是正在打字的欄位），開在空間較大的那一側（通常是下方），再用限高自己捲。可用高度由 JS 寫成 `--anchored-room`，浮層的 CSS 用 `max-block-size: min(<自己的上限>, var(--anchored-room, …))` 接。
4. 左右**夾進視窗**，與視窗邊緣至少 8px。
5. **不得為了開浮層去捲動頁面或移動游標。**
6. 用 `position: fixed` 與視窗座標；不要混用文件座標。

現況（票 33）：slash 選單（錨點是游標的 rect）、欄位說明面板、實體欄與群演欄的選單、組字預覽、待確認面板、命名提示、登場人物提示、內外／時間選單都已接上；票 36 的第二層浮層同用這支。⚠️ 尚未接上：定點選單（`point-menu.tsx`，往外長的另一套算法）。ⓘ 按鈕與它的懸停提示已在票 101 拿掉：欄位說明改成欄位選單最下面的一列（`ⓘ 關於地點 (⌥/)`），選了就由說明面板**取代**選單、開在同一個位置；面板最上面的 `← 返回 (Esc)` 退回打開前的那一層（票 101 第二輪）。

**The Dialog Placement Rule.** 模態對話框：水平置中、**靠上對齊**在 header 下緣再空 24px（`calc(var(--bar-height) + var(--space-5))`），寬 `min(28rem, 100%)`（內容多的可放寬到 36rem），內容超高就在對話框裡捲、動作列永遠看得到。白底、1px `--rule-strong`、12px 圓角、`--shadow-popover`、padding 24px，scrim 見 Elevation。動作列靠右、間距 12px。⚠️ 現況不符：合併確認窗是垂直置中；快捷鍵總覽貼齊視窗頂端（票 88）。

### Navigation
- **Header**：見 Layout。左側 breadcrumb 回專案；**「劇本／場次表」切換**是 `/` 分隔的兩個文字連結，目前那一個 `aria-current="page"`：`--text-primary`、600、底線 offset 0.3em；其他 `--text-secondary`。不畫框、不做 pill。
- **Tabs**（建立精靈）：`--text-secondary` 字、底部 2px 透明線；選中轉 `--text-primary` 600、底線 `accent`。
- **場次導覽 sidebar**：列 hover `--surface-raised`；目前場次 `aria-current="location"` 用 `--selection-bg`；草稿只換場次號字色為 `--draft-fg`；子場次縮一階並帶細直線。場次號 `tabular-nums`。

### Scene Heading & Chips（待定）

編輯器裡**場次抬頭與 chip 的長相尚未定案**，之後另外設計，這份檔案**刻意不先定**：
- 抬頭非焦點時收合成一行 —— 票 83。
- 對白人物 chip 上的 V.O.／O.S. 標記 —— 票 59。
- 欄位記號從 emoji 換成 SVG —— 票 55。

在那之前，只有兩條已知的約束：metadata **預設可見、缺漏不可被預設 UI 隱藏**（規格 §7.11）；空欄位的「還沒填」主要靠虛線框說，字用 `--text-secondary`（票 86）。

### Decoration

場次號、子場次號、草稿標籤、群組宣告是 decoration：住 gutter、不可編輯、不可選取、system-ui、`tabular-nums`。低對比只是第三支撐，主要靠位置與 interaction boundary。草稿標籤例外地帶 `draft` 色，因為它要說「這場會擋你匯出」。`以下對剪` 是 editorial annotation，可以有自己的視覺權重（它會印進 PDF）。

## Do's and Don'ts

### Do:
- **Do** 每個視覺決定先問「第八個小時受得了嗎」。
- **Do** 一律用 semantic token（`--text-*`、`--surface-*`、`--rule*`、`--control-*`、`--draft-*`、`--error-*`）；新增角色前先證明既有的四個角色裝不下。
- **Do** 可操作元件與 placeholder 用 `--text-secondary` 以上；文字對比守 WCAG 2.2 AA（4.5:1，非文字元件 3:1）。
- **Do** 每個畫面至多一顆實心 accent 主要按鈕。
- **Do** 危險動作用 error 字＋框、放最後、與常用動作隔開。
- **Do** 所有錨定浮層走同一支定位函式：下方優先、可翻上方、夾進視窗 8px、不捲頁。
- **Do** 劇本與文件的行長用 `ic` 表達、`em` 作 fallback；行高寫無單位比值。
- **Do** 動畫只用 opacity 這類短的狀態轉換（現況 120ms），並尊重 `prefers-reduced-motion`。

### Don't:
- **Don't** 模擬任何輸出格式：A4 紙感、分頁線、標楷體／明體、12 級字、三角形、框框（不變式 G）。
- **Don't** 給場次、區塊或對白畫邊框；不要用顏色區分動作／對白／插入畫面。
- **Don't** 在劇本頁用粗體或載入 400 以外的 Noto Sans TC 字重。
- **Don't** 把 `--text-faint` 用在按鈕、開關、觸發鈕、placeholder 或要人讀的說明上；也不要為了救對比調深 neutral-400。
- **Don't** 讓第二種主要按鈕樣式出現（深色框＋600、實心灰、實心紅都不行）。
- **Don't** 用實心紅做危險按鈕；不要用 error 色標必填或「還沒填」。
- **Don't** 加第二種陰影或 hover 浮起；不要用黑色半透明遮罩。
- **Don't** 在原始碼寫 hex，也不要發明 z-index 中間值。
- **Don't** 用 emoji 當介面記號或語氣（票 55 會換成 SVG）。
- **Don't** 在 v1 加 brand color、獨立 mark 或行銷式的視覺；wordmark 只改 SVG 資產、不在 CSS 調。

### 已知缺口（記錄，不在這次修）
- 手動草稿標籤（`draft` 字在 `draft-weak` 底、13px）實算 **4.27:1**，低於 AA 4.5:1。草稿標籤帶狀態語意，不屬於可豁免的 decoration —— 待開票或併入 96。
- `--color-accent` 目前被 `app.css`、`documents.css` 直接引用（主按鈕底、tab 底線、選取底），沒有對應的 semantic token（如 `--action-bg`）。不違反「不寫 hex」，但深色模式換值時要一起看。
