# Typography 與色彩系統

For: [票券 26](../issues/26-ui-visual-direction.md)（**已 resolve，2026-09-01**）。討論在 [`./ui-visual-direction.md`](./ui-visual-direction.md)，字型證據在 [`./ui-fonts-cjk.md`](./ui-fonts-cjk.md)，圖片素材在 [`./assets/ui/`](./assets/ui/README.md)。

> **狀態：多數已定案。** 票券 26 已 resolve，下表的值可被實作引用，**除了明確標記 ⚠️ prototype hypothesis 的兩個**（`--text-base`、`--leading-base`）。
>
> 全部值都受**不變式 G** 約束（[ADR-0010](../../../docs/adr/0010-editor-representation-is-not-output-preview.md)）：不得為模擬特定輸出格式而引入非必要的版面約束或視覺結構。**PDF 模板的數字一律不繼承。**
>
> **為什麼是 markdown 而不是 CSS／JSON**：這份檔案需要一欄「**為什麼是這個值**」，那是 CSS 與 JSON 裝不下的，而六個月後最需要的正是它。畢業路徑見 §4。

---

## 1. Typography

### 1.1 字型

| token | 值 | 用在哪 | 為什麼 |
|---|---|---|---|
| `--font-body` | **self-host Noto Sans TC** | 劇本內文、對白、動作 | SIL OFL 1.1，是**唯一**可合法 self-host 的繁中黑體家族。蘋方（Apple 嵌入限制）與微軟正黑體（Monotype 立場不明）**都不能當 webfont**；純系統字路線跨平台字重層級會塌（Android 只內建 Regular）。證據見 [`./ui-fonts-cjk.md`](./ui-fonts-cjk.md) |
| `--font-ui` | **system-ui stack** | 側欄、按鈕、選單、場次表、decoration | 介面文字量小，跨平台不一致的代價低，且**零額外 webfont 成本**。「介面像你的作業系統、內容像你的稿子」正是 decoration 要的那條界線 |
| `--font-mono` | （不設） | — | v1 沒有消費者 |

**fallback 鏈**：`"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif`

> ⚠️ **兩套字型不是 invariant。** 真正的原則是 **content 與 editor UI 需要不同的 typographic role**；font family 只是目前實現該區分的手段之一。即使未來兩者用同一 family，decoration 的區分仍靠空間位置與 interaction boundary 成立（見 §2.2）。

> **編輯器字型與 PDF 字型是兩套。** PDF 模板另有自己的選擇（TNUA 規範用標楷體，GHSA 未規定）。楷體／明體**不進螢幕編輯器**：螢幕長時間閱讀吃力，且拉進來就違反不變式 G。

### 1.2 字級與行高

| token | 值 | 用在哪 | 為什麼 |
|---|---|---|---|
| `--text-base` | **17px** ⚠️ | 劇本內文 | ⚠️ **prototype hypothesis**。繁中在 16px 下筆畫密的字開始糊 |
| `--leading-base` | **1.85** ⚠️（可探索 1.75–2.0） | 劇本內文 | ⚠️ **prototype hypothesis**。**無單位比值**，字級一改行距自動跟上。漢字沒有 x-height 的視覺喘息，行距吃緊整段會糊 |
| `--text-sm` / `--leading-sm` | 未定 | 內嵌簡表、場次表 | 待 §1.2 兩個基準值實測後推導 |
| 場次標題 | **不另設字級 token 之外的手段** | — | 層級用**字級、spacing 與結構位置**建立，**不用字重**（見 §1.3） |

> ⚠️ 上面兩個 ⚠️ 是本檔**唯一**需要 [`../prototypes/editor`](../prototypes/editor) 實測才能定案的值。其餘皆已定案。
>
> **不繼承的參考點**（屬 PDF 那一套）：GHSA 硬性只有「直式橫書繁中 12 級字」；TNUA 為 12pt／行距 16pt（比值約 1.33）。螢幕上太緊。

### 1.3 字重

| token | 值 | 為什麼 |
|---|---|---|
| `--font-body` 的字重 | **只載 Regular 400** | 規格書約束 2 已把粗體從資料裡拿掉（StarterKit 的 mark 全關），字重**不得表達內容語意**；`--font-ui` 走 system-ui 後介面字重免費。**不為視覺偏好承擔一整套 CJK font payload** |
| `--font-ui` 的字重 | 系統字重，自由使用 | 零成本 |

> 載入策略（unicode-range／subset／FOUT）歸 **[票券 29](../issues/29-cjk-webfont-loading-strategy.md)**。

---

## 2. 色彩

> **語意 token，不用色階名。** 票券 26 定：**所有 UI 色彩必須透過 semantic token 表達**，程式碼裡不得出現 hex。
>
> **v1 僅定義 Light theme。** 深色是純換值，不是重做。

### 2.1 v1 的色彩角色 —— 四個

| 角色 | 用在哪 | 為什麼 |
|---|---|---|
| **accent** | 可點擊、選取、focus | **依自身語意獨立設計，不從 brand color 衍生**（[票券 28](../issues/28-brand-identity.md) Q7／Q22） |
| **draft** | 草稿場次標籤 | **document state** —— 常駐、大量、判準是**不疲勞** |
| **error** | 匯出前防呆的錯誤態 | **action consequence** —— 只在匯出彈窗出現，可以刺眼 |
| **neutral** | 文字與介面層次 | 主色調。判準是**不搶戲** |

> ⚠️ **2026-09-01（票券 28）改寫。** 原本三個角色是 `accent／warning／neutral`，且 accent 記為「取自 brand palette 的 Amber，降飽和後才進介面」。兩處都已失效：
>
> 1. **`warning` 拆成 `draft` 與 `error`**（Q4）—— 它們不同層：一個是文件狀態、一個是動作後果，判準相反（不疲勞 vs 可以刺眼）。`warning` 這個角色在 v1 **沒有消費者**。
> 2. **依賴方向反轉**（Q7 撤回）—— **semantic UI color 依各自語意獨立設計；brand color 在視覺語言確定後才產生，不得反過來成為 UI role 的隱性 constraint。** 因此 accent 不再「取自 brand palette」。
> 3. **v1 沒有 brand color**（Q22）—— 盤點後它沒有承載位置：wordmark 過單色測試、favicon 的 identity 來自形式而非顏色、accent 歸本檔、v1 無 landing page。**accent 的具體色值歸票券 26，不歸票券 28。**

**暫不建立 success semantic role** —— 交付狀態用文字說。

### 2.2 原本以為需要顏色、但不需要的

這張表比上一張更有資訊量：票券 26 的裁決**縮小**了色彩系統。

| 角色 | 為什麼不需要顏色 |
|---|---|
| 場次號、子場次號、群組宣告 | decoration 靠**空間位置**（gutter、不進 content flow）與 **interaction boundary**（不可編輯、不可 select），typography role 為第三支撐。低對比只是輔助 |
| 三種區塊型別（動作／對白／插入畫面） | 它們是**內容**不是 decoration。上顏色等於重建「格式即內容」的暗示。改以縮排、欄寬、spacing 與閱讀 rhythm 表達 |
| 分享／唯讀模式 | 沿用 editor 的 semantic visual language，只移除 editing affordance。**Share ≠ PDF preview** |

⚠️ 例外：**草稿標籤**雖是 decoration，卻需要 **draft** —— 它要說的是「會擋你匯出」，那不是低對比能表達的。`以下對剪` 同屬 decoration system，但語意上是 **editorial annotation**，可有獨立的視覺權重。

### 2.3 深色模式

| | |
|---|---|
| v1 做不做？ | **不做。v1 僅定義 Light theme** |
| 理由 | 不是「以後再說」，而是 semantic token 本來就該如此 —— 顏色全走 token、不硬寫 hex，深色是純換值 |

---

## 3. 版面

| 項目 | 值 | 為什麼 |
|---|---|---|
| 內容欄閱讀寬度 | **約 30–40 個全形字** | 繁中的行長判準跟英文（45–75 字元）不同構 |
| 表達方式 | ⚠️ **待研究** —— 優先 `ic` 或其他與字面相關的相對 inline-size 單位 | **明確否決以 `ch`／`em` 直接表達中文字數**。歸[票券 27](../issues/27-ui-component-layer.md)，標記為**實作研究不是視覺決策** |
| 是否統一欄寬 | **否** | 30–40 是**閱讀基準**不是統一欄寬；動作／對白等區塊可有不同的 reading measure |
| 整體密度 | **偏鬆** | 判準是八小時的疲勞度，不是一屏塞多少 |
| 場次容器 | **不畫邊框** | 靠場次標記、gutter 與場次間距建立結構邊界。畫框會推回 GHSA 2022 拿掉的那個「框框」，踩到不變式 G 的邊界 |

---

## 4. 畢業路徑

1. **值 → 程式碼 token**（CSS 變數／TS），除 §1.2 兩個 ⚠️ 之外皆可引用
2. **「為什麼」欄的核心已畢業成 [ADR-0010](../../../docs/adr/0010-editor-representation-is-not-output-preview.md)**；本表的逐格理由留在這裡
3. 本檔留原地當 primary source，不刪
