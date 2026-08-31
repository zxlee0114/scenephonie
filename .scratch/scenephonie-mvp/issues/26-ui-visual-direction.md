# 應用程式的 UI 風格與視覺方向

Type: grilling
Status: resolved
Blocked by:

## Question

規格書（[`../spec.md`](../spec.md)）已定稿，資料模型與功能邊界寫定，但**畫面長什麼樣**還完全沒有答案。這張票要把「UI 風格」這個模糊詞磨成可判定的敘述，並收斂出 v1 的視覺方向。

### 為什麼現在才夠銳利

規格書的**約束 2**（資料模型不含呈現性資訊）已經把呈現層切成兩套獨立模板：

| 模板 | 狀態 |
|---|---|
| **PDF 輸出樣式** | **已鎖定** —— 對齊 GHSA 格式，[規格書 §9](../spec.md) 逐元素寫定 |
| **編輯器樣式** | **完全未決** —— 本票的範圍 |

換句話說，這張票只需要回答編輯器那一套，而 PDF 那一套已經是它的**已知對照組**。這是問題收斂到可以問的原因。

### 要回答

1. **⚠️ 編輯器要不要長得像輸出的 PDF？** 這是決定整個視覺方向的第一題，其餘問題的答案都依賴它。
   - **所見即所得**（近 Final Draft）：編劇有安全感，第一次打開就知道自己在寫劇本。
   - **純結構化區塊**（近 Notion）：核心賭注更純粹，但「格式與內容脫鉤」會變得抽象。
   - ⚠️ **拉扯點**：若編輯器就長得像 GHSA 格式，使用者可能又開始把格式當內容 —— 那正是[規格書 §1](../spec.md) 要治的病。
2. **畫面清單與導覽**：專案 → 劇本 → 場次表 → 交件文件 → 分享頁，各自是什麼、彼此怎麼走？（這一題是規格書的投影，不是美感問題，可在對話裡定。）
3. **視覺語彙**：字體（繁中內文字型的取捨）、字級與行高、色彩、留白密度。判準包含**長時間寫作的疲勞度**。
4. **decoration 怎麼浮現？** 場次號、子場次號、草稿標籤、群組宣告四者都不是文件內容（[規格書 §5.4](../spec.md)），視覺上必須讓編劇看得懂「這不是我打的字」。
5. **內嵌簡表的呈現**：它在資料上是 metadata，在畫面上要像表格、像標籤列、還是像可摺疊的抬頭？
6. **參照對象是誰？** Final Draft／WriterDuet／Scrivener／Notion／Ulysses ——「像誰」與「**刻意不像誰**」都要說得出理由。

### 不在這張票內

- **PDF 輸出樣式** —— [規格書 §9](../spec.md) 已定。本票只決定編輯器，不動輸出。
- **新手引導的形式** —— 仍在迷霧（[規格書 §14.3](../spec.md)、[`../map.md`](../map.md) 的 Not yet specified）。它是本票的鄰居而非本體：先有畫面才談得上引導什麼。
- **互動手感的實測**（打字、Tab 環、拖曳回饋、IME）—— 那不是討論得出來的，屬於 prototype。本票只決定方向，實測用 [`../prototypes/editor`](../prototypes/editor)。

### 它擋什麼

**不擋開工。** [規格書 §13.2](../spec.md) 的階段 0（isomorphic schema）與階段 1（domain command 層）都是純函式，不需要知道本票的答案。它**擋階段 2**（編輯器）。

## 材料

| 檔案 | 放什麼 |
|---|---|
| 📄 [`../research/ui-visual-direction.md`](../research/ui-visual-direction.md) | 參考資料與討論的主場。§1「別人怎麼做」／§2「我想要什麼」分節 |
| 📄 [`../research/ui-tokens-draft.md`](../research/ui-tokens-draft.md) | 暫定的 Typography 與色彩系統。**值**，不是圖片；是這批素材裡唯一會直接畢業成程式碼的 |
| 🖼 [`../research/assets/ui/`](../research/assets/ui/README.md) | 圖片素材。`ref/` 放別人的截圖、`draft/` 放自己與 AI 生成的，慣例見該目錄的 `README.md` |

## Answer

**2026-09-01，grilling 十三題定案。** 核心產出是一條不變式，其餘決策全掛在它上面 —— 見 [ADR-0010](../../../docs/adr/0010-editor-representation-is-not-output-preview.md)。

### 1. 編輯器要不要長得像輸出的 PDF —— 不變式 G

> **編輯器可以呈現 screenplay 的閱讀與創作語意，但不得為模擬特定輸出格式而引入非必要的版面約束或視覺結構。**

三個候選裡選的是「有劇本感、但刻意不是那一份 PDF」，但**措辭刻意不具名 GHSA** —— 綁在具體對象上，多一種輸出格式時就要重寫（Out of scope 的「多格式輸出」已預告架構參數化）。

它的價值在**可否證**：分頁線、A4 紙感、標楷體、12 級字、三角形、框框全數出局（只為模擬輸出而存在）；場次成塊、動作與對白的節奏、對白較窄的閱讀寬度留下（是閱讀語意，不依賴任何輸出格式）。

⚠️ **兩個不明顯的後果**：唯讀分享頁沿用編輯器的閱讀呈現而非 PDF 預覽（見第 6 點）；編輯器 typography **不繼承** PDF 模板的數字（見第 8 點）。

### 2. 品牌識別移出本票 → [票券 28](./28-brand-identity.md)

判準不共用一把尺：**品牌要辨識度、要搶眼；寫作介面的判準是不搶戲。** 綁在一起會讓其中一個遷就另一個。Brand palette 僅以 **accent candidate** 身分進來，**不預先決定其具體衍生色值**，且不得直接成為 editor palette。

⚠️ 順帶記一件事：`overall-v1-a.png` 右下角的 usage example 畫的是 `SCENE 12`／`INT. COFFEE SHOP — DAY` 的**美式所見即所得** —— 它在第 1 題被回答之前就悄悄替它給了答案，正是研究檔 §2.3 那條警告的情形。該圖不作為編輯器視覺的參考。

### 3. 資訊架構收，UI 元件層暫緩 → [票券 27](./27-ui-component-layer.md)

**收下的是資訊架構**：專案清單 → 專案首頁 → 劇本編輯器／場次表 → 分享頁；文件的掛載層級直接沿用 [ADR-0009](../../../docs/adr/0009-documents-hang-on-the-creative-unit-they-describe.md)（大綱與角色設定表掛**專案**、分場大綱掛**劇本**），導覽反映該層級，使用者就免費學到掛載規則。

**暫緩的是元件**：tab／routes／split view／sidebar 留給後續視覺互動決定。

### 4. 色彩系統：一個 accent、一個 warning、一組 neutral

第 5 題與第 6 題合起來**縮小**了色彩系統 —— decoration 不靠顏色、區塊型別不靠顏色，tokens 檔 §2.2 原列的七個角色有三個因此不需要顏色。

v1 限定三個角色，**暫不建立 success semantic role**（交付狀態用文字說）。warning **不得**與 accent 同色：「這裡不完整、會擋你匯出」與「這裡可以點」是相反的語意。

### 5. decoration 怎麼浮現

依賴三件事，**低對比僅為輔助**（單靠它會失效 —— 草稿標籤需要警示意味，一警示就跟其他 decoration 的低對比策略打架）：

1. **空間位置** —— gutter，不進 content flow
2. **interaction boundary** —— 不可編輯、不可 select
3. **typography** —— UI role 與 body role 之分

⚠️ `以下對剪` 同屬 decoration system，但語意上是 **editorial annotation**，**可有獨立的視覺權重**（它是編輯器裡的 decoration，卻在 PDF 裡要印）。

⚠️ 第 3 點的措辭在第 13 題被修正過：依賴的是 **typographic role 的分離**，不是「一定要兩套 font family」。family 只是目前實現該區分的手段。

### 6. 分享／唯讀頁

沿用 editor 的 reading representation 與 semantic visual language，移除全部 editing affordance。**Share ≠ PDF preview**；PDF export 維持獨立的 output representation。這是不變式 G 的直接後果 —— 分享頁若給 GHSA 版面，等於從後門把輸出格式塞回螢幕。

### 7. 內嵌簡表：chip row

**預設常駐，但不鎖死永遠不可收合。** 定的是原則：**metadata 預設可見，且缺漏不可被預設 UI 隱藏**（摺起來就看不到自己缺什麼，「空 metadata → 自動是草稿 → 匯出前被攔」的防呆會變成驚喜）。是否提供 focus mode／global collapse 是 usability 決策，歸[票券 27](./27-ui-component-layer.md)。

否決表格形狀：六個欄位會撐成比內容還重的視覺物件。

### 8. Typography

| token | v1 值 | 性質 |
|---|---|---|
| `--font-body` | self-host **Noto Sans TC** | 已定 |
| `--font-ui` | **system-ui** stack | 已定 |
| 字重 | **只載 Regular 400** | 已定 |
| `--text-base` | 17px | ⚠️ prototype hypothesis |
| `--leading-base` | 1.85（可探索 1.75–2.0，無單位比值） | ⚠️ prototype hypothesis |

理由不是「一定要兩套字型」，而是 **content 與 editor UI 需要不同的 typographic role**。

字型選型的證據見 [`../research/ui-fonts-cjk.md`](../research/ui-fonts-cjk.md)：**蘋方與微軟正黑體都不能 self-host 成 webfont**（Apple 嵌入限制／Monotype 立場不明），只能當 fallback；可合法自建的繁中黑體是 SIL OFL 1.1 的思源黑體家族；純系統字路線會跨平台塌掉字重層級（Android 只內建 Regular）。

**只載一個字重**的理由：規格書約束 2 已把粗體從資料裡拿掉，字重不得表達內容語意；`--font-ui` 走 system-ui 後字重免費；場次標題的層級改用**字級、spacing 與結構位置**建立。**不為視覺偏好承擔一整套 CJK font payload。**

⚠️ `--text-base` 與 `--leading-base` 兩個值**不是 invariant**，需於 [`../prototypes/editor`](../prototypes/editor) 實測後決定。其餘 token 不帶此標記。

### 9. 三種區塊型別不用顏色區分

動作／對白／插入畫面是**內容**不是 decoration。上了顏色等於在畫面上重建一套「格式即內容」的暗示。改以**縮排、欄寬、spacing 與閱讀 rhythm** 表達結構。

### 10. 內容欄寬與留白密度

以**約 30–40 個全形字**的閱讀寬度為基準，整體密度**偏鬆**（判準是八小時的疲勞度，不是一屏塞多少）。

⚠️ 兩條修正：**不要以 `ch`／`em` 直接表達「中文字數」**，優先研究 `ic` 或其他與字面相關的相對 inline-size 表達（歸[票券 27](./27-ui-component-layer.md)，標記為實作研究不是視覺決策）；**30–40 是閱讀基準不是統一欄寬**，動作／對白等區塊可以有不同的 reading measure。

### 11. 「場次之外不能打字」的視覺表達

場次是**有起點的內容容器，但不以邊框描繪** —— 靠場次標記、gutter 與場次間距建立結構邊界；**場次之外不存在 canonical text insertion point**。

新增場次 affordance：**insertion zone 的 hover／focus 時出現**；**最後一場下方固定呈現**，以提供明確的 append 操作。

⚠️ **否決畫邊框**：框會把畫面推回台灣舊格式那個「框框」的樣子，而框框與三角形正是 GHSA 2022 改版拿掉的東西 —— 即使理由不同，在編輯器裡重建它就踩到不變式 G 的邊界。

### 12. 參照與反參照

> **像 Ulysses 的沉靜，借 Notion 的區塊語意，刻意不像 Final Draft 的版面權威與 Scrivener 的窗格密度。**

這是 **reference／anti-reference，不是視覺拼貼**。逐項理由：Final Draft／WriterDuet 的價值主張是「保證你的格式沒錯」，與我們的「格式不該是你的事」相反；Notion 的區塊語意規格書已經借了，但它的介面密度是為多人文件工具設計的；Ulysses／iA Writer 解的是同一題（長時間寫作、介面退到背景）；Scrivener 把結構化表達成滿螢幕的窗格，而我們的結構化在資料裡。

### 13. 新手引導那塊迷霧

**維持原樣。** 本票的第 11 點把「場次之外不能打字」變成視覺上自明的東西，**降低了它造成的 onboarding burden**，但整體引導形式仍未決定，也還不夠銳利到能開票。

### 畢業與去處

| 東西 | 去處 |
|---|---|
| UI 元件層、focus mode／global collapse、`ic` 與行長的相對表達 | **[票券 27](./27-ui-component-layer.md)**（新開） |
| 品牌識別（logo、字標、icon、Amber 的衍生色值、tagline） | **[票券 28](./28-brand-identity.md)**（新開） |
| Noto Sans TC 的 subset／unicode-range 載入策略 | **[票券 29](./29-cjk-webfont-loading-strategy.md)**（新開，research） |
| 互動手感實測、`--text-base` 與 `--leading-base` 的實測 | [`../prototypes/editor`](../prototypes/editor)，**不另開票** |
| 新手引導 | 留在地圖的 Not yet specified，加註記 |

## Comments
