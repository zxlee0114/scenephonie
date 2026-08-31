# UI 元件層與互動結構

Type: grilling
Status: open
Blocked by:

## Question

[票券 26](./26-ui-visual-direction.md) 定了**視覺方向**與**資訊架構**，但**刻意暫緩**了具體的 UI 元件與互動結構。這張票接手那一塊。

⚠️ **不要重開票券 26 已定的東西** —— 不變式 G（[ADR-0010](../../../docs/adr/0010-editor-representation-is-not-output-preview.md)）、色彩系統的規模、typography role、decoration 的區分手段都已定案，本票在那些約束**之內**做元件決策。

### 要回答

1. **導覽的元件形狀**：資訊架構已定（專案清單 → 專案首頁 → 劇本編輯器／場次表 → 分享頁；文件掛載依 [ADR-0009](../../../docs/adr/0009-documents-hang-on-the-creative-unit-they-describe.md)）。未決的是它長成 **tab／routes／split view／sidebar** 之中的哪些，以及 sidebar 常駐或收合。
2. **focus mode / global collapse**：票券 26 定了「**metadata 預設可見，且缺漏不可被預設 UI 隱藏**」。是否提供使用者主動觸發的收合或專注模式，是 usability 決策，留在這裡。
3. **`ic` 與行長的相對表達** — ⚠️ 這是 **typography／CSS 的實作研究，不是已定案的視覺決策**。票券 26 定的是「內容欄以約 30–40 個全形字的閱讀寬度為基準，密度偏鬆」，並**明確否決**了用 `ch`／`em` 直接表達中文字數。要查的是 `ic` 單位（或其他與字面相關的相對 inline-size 表達）的可用性、瀏覽器支援與實際行為。⚠️ 30–40 是**閱讀基準不是統一欄寬** —— 動作／對白等區塊可以有不同的 reading measure。
4. **新增場次 affordance 的實作形狀**：票券 26 定了行為（insertion zone 的 hover／focus 時出現；最後一場下方**固定呈現**以提供明確的 append），未定的是它的元件外觀與可及性（鍵盤如何抵達）。

## 它擋什麼

擋[規格書 §13.2](../spec.md) 的**階段 2**（編輯器），與票券 26 同一層。不擋階段 0–1。

## 材料

實測與手感的部分屬 prototype，不屬本票的對話 —— 見 [`../prototypes/editor`](../prototypes/editor)。
