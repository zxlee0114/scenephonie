# PDF 匯出技術方案

Research for: `.scratch/scenephonie-mvp/issues/05-pdf-export-tech.md`
查證日期：2026-08-17（所有版本號、平台限制數字均為此日期查證，生態變動快，之後需重新核對）

## 結論先講：中文字型在 serverless 上「可行嗎」

**可行，且比坊間文章描述的寬鬆得多 —— 但取決於用哪個 serverless 平台，而 Vercel 目前（2026-07-01 更新的官方文件）已經寬鬆到不構成障礙。**

關鍵事實鏈：

1. **所有候選方案的 PDF 產出階段都會自動做字型子集化（subsetting）**，只嵌入實際用到的字（PDFKit/fontkit、Chrome 的 Skia+HarfBuzz、XeLaTeX 都確認會這樣做，Typst 有子集化機制但本次未找到其官方文件明文保證只嵌入用到的字形，信心較低）。所以「最終 PDF 檔案大小」從來就不是真正的風險——**風險是「渲染當下，執行環境裡要有完整的字型來源檔可讀」**，這個來源檔動輒 5–20 MB（見下）。
2. 因此真正要問的問題是：**部署包（deployment bundle）能不能塞下「完整字型檔 + 渲染引擎本身」？**
3. 查證結果：
   - **Vercel**：官方文件（`vercel.com/docs/functions/limitations`，last_updated 2026-07-01）目前規定 Functions 未壓縮上限 **250 MB**（Python 500 MB），啟用 fluid compute 的新專案還可用 beta 的 **Large Functions 到 5 GB**。這與網路上大量文章講的「50 MB 限制」已經過時——那是舊制，已被取代。250 MB 這個數字足以同時放下一個 CJK 字型檔（10–20 MB）與 `@sparticuz/chromium`（實測 v149.0.0 為 69.7 MB unpacked，來源：npm）。**Vercel 上用 Puppeteer/Playwright + 完整 CJK 字型是可行的**，且不再需要激進的字型裁切才能塞進去。
   - **AWS Lambda（zip 部署）**：官方硬限制未壓縮 **250 MB**（含 layers），這是 AWS 端的硬限制、不可調整；改用容器映像可到 **10 GB**。同樣裝得下字型+Chromium，只是若走 zip 部署要更精打細算；容器部署完全沒壓力。
   - **Cloudflare Workers**：Paid plan 每個 Worker 上限僅 **10 MiB**（Free 3 MiB，來源：Cloudflare 官方 platform limits 文件）。**把完整 CJK 字型檔和/或 Chromium 直接打進 Worker bundle 在 Cloudflare Workers 上不可行**——10 MB 連一顆字型檔都未必放得下，更別提瀏覽器引擎。Cloudflare 有獨立的 **Browser Rendering API**（Workers Paid 方案 $5/月起，另計 browser-minute／並發數），Chromium 執行在 Cloudflare 管理的機群上、不算進 Worker bundle，字型可用網頁內 `@font-face` 動態載入，理論上可繞開這個限制，但這是另一套產品、另一套計費模型，不是「把 Puppeteer 塞進 Worker」。

**對部署平台選擇的影響**：如果最終選 Puppeteer/Playwright 路線（本報告首選之一），**Cloudflare Workers（純 Worker 執行）出局**，除非改用 Cloudflare Browser Rendering 這個獨立產品或另尋 Chromium-as-a-service（Browserless、Steel 等）。**Vercel 或 AWS Lambda（含容器選項）目前的限制都足夠寬鬆**，字型不再是擋路的硬限制——這算是讓地圖上「部署與資料庫託管」那團霧提早畢業的一個資訊：*Vercel 用 serverless functions 的路線，不會被中文字型或 Puppeteer 卡住*。真正該問的部署平台問題轉移到成本、冷啟動延遲、資料庫連線模式，而不是「裝不裝得下」。

---

## 候選方案總覽

| 方案 | 執行環境 | CJK 排版精確度 | 部署包大小影響 | 分頁控制 | 多格式參數化難度 | Next.js 契合度 | 維護負擔（獨立開發者） |
|---|---|---|---|---|---|---|---|
| **Puppeteer/Playwright（HTML→PDF）** | 伺服器端，需 Chromium binary | 高（沿用瀏覽器 CSS/字型引擎，CJK 折行、標點擠壓由瀏覽器原生處理，成熟） | 中～大：`@sparticuz/chromium` ~70 MB + CJK 字型 10–20 MB | 好：CSS `break-inside: avoid`、`break-before`、`orphans/widows` 均由 Chromium 原生支援 | 好：HTML/CSS 模板天生適合參數化（換 CSS 檔＝換格式） | 極高：React 元件直接渲染成 HTML 再轉 PDF，前後端可共用排版邏輯 | 中：Chromium binary 的環境相依性是持續的維運項目（版本升級、glibc 相依），但生態成熟、範例多 |
| **`@react-pdf/renderer`** | 伺服器端或瀏覽器端（純 JS，無外部 binary） | 中～低：**官方已知限制**——不支援 CJK 逐字折行與禁則（kinsoku）規則，長中文字串會整行溢出容器，需自行處理（GitHub issue #1568, #2917 均為開放中的已知問題） | 小：無 Chromium，只需字型檔本身 | 有限：以 React 元件方式表達分頁提示（`wrap={false}`），無成熟的 CSS-like break 語意，細緻控制較弱 | 中：以 React props 傳版面參數是可行的，但排版引擎本身（textkit）對 CJK 支援天生較弱，換格式時可能撞到同一個折行問題 | 高：純 React／TS 生態，型別友善 | 低～中：無外部 binary，但要另外處理 CJK 折行是額外開發負擔，非現成 |
| **Typst** | 伺服器端（原生二進位執行檔或 WASM） | 中：CJK 折行（kinsoku）基本支援，但**官方 issue 明確指出標點擠壓（punctuation squeezing/overhang）尚未完整**，屬已知、持續開發中的缺口（typst/typst#193, #276, #6582，2025–2026 仍在討論） | 小：Typst 本身是單一二進位檔（數十 MB 內），字型另外提供 | 有：`block(breakable: false)`、頁面控制語法完整，屬其強項 | 好：Typst 的樣板／函式機制專為參數化排版設計，語言本身就是為此而生 | 低：非 JS/TS 生態，需另開子行程呼叫、或找 Node binding（生態尚新） | 中：語言與生態相對新（2023 年才 1.0），繁體中文社群資源少於 LaTeX，獨立開發者要踩生態新坑的風險 |
| **LaTeX（XeLaTeX + xeCJK）** | 伺服器端，需完整 TeX 發行版（TeX Live，數百 MB～數 GB） | 高：CJK 排版（xeCJK）成熟穩定，繁中社群資料多，字型子集化行為明確（只嵌入用到的字形） | **極大**：TeX Live 完整安裝動輒 **數 GB**，遠超所有 serverless 平台限制；即使裁成 minimal profile 仍需另外裝 CJK 巨集與字型套件，工程量不小 | 好：LaTeX 排版引擎本身對分頁/避免切斷段落控制力強（`\nobreak`、`\FloatBarrier` 等），但語法不如 CSS 直覺 | 中：模板可用 `.sty`／變數參數化，但 TeX 語法學習曲線陡，獨立開發者長期維護模板的心智負擔較高 | 低：需另開子行程呼叫系統層 `xelatex`，與 Next.js 生態幾乎無交集 | 高：TeX 發行版體積與環境依賴是持續痛點；serverless 上幾乎不可行，需自架伺服器或用容器 |
| **WeasyPrint（HTML/CSS→PDF）** | 伺服器端，Python | 中：支援 CSS 分頁屬性（`break-inside` 等，v69 起完善），但**不內建 CJK 字型**，需自行提供並手動註冊系統字型；本次查證未找到其對中文標點擠壓/避頭尾規則的原生支援證據 | 中：無 Chromium，但需要 Python runtime + 字型 | 好：CSS `break-*` 屬性原生支援完整 | 好：HTML/CSS 模板同樣天生適合參數化 | 低～中：Python 生態，與 Next.js/TS 技術棧不同語言，需額外維運一個 Python 服務或子行程 | 中：多一個語言/runtime 的維護面 |
| **Prince XML** | 伺服器端，商業軟體 | 高：業界公認 CJK/分頁控制俱佳，付費商業產品 | 未深入查證，商業授權本身即非獨立開發者友善選項 | 好 | 好 | 低 | 需付費授權，不符合「非商業專案、獨立開發者」前提，本次僅列入對照未深究 |
| **pdf-lib / Satori+resvg** | 伺服器端，純 JS/WASM | 低：pdf-lib 是低階 PDF 操作函式庫，本身不做排版；Satori 主要設計給 OG image（單頁圖片）情境，非多頁長文排版 | 小 | 弱：需自行從零實作分頁邏輯 | 差：等於自己造排版引擎 | 高（語言層面）但工程量大 | 高：等於重新發明排版引擎，不建議用於多頁劇本文件 |

---

## 逐維度細節

### 1. 中文字型嵌入（已於上方「結論先講」詳述關鍵數字，此處補充細節）

- **字型檔案大小**：Noto Sans TC 官方（Google Fonts／`notofonts/noto-cjk`）完整字重檔案約 **4.5–9 MB** 一個字重；Noto Sans CJK 全字集（含所有語言變體）單檔可達 **16 MB**（來源：CJK 字型優化相關文章與 noto-cjk repo README，二手整理資料，非 Google 官方逐字公告的單一數字，此處數字有一定不確定性，見「不確定與缺口」）。
- **子集化效果**：所有候選渲染引擎（PDFKit/fontkit、Chrome/Skia+HarfBuzz、XeLaTeX、Typst）在**輸出 PDF 檔案**這個環節都只嵌入實際用到的字形，因此**最終 PDF 檔案本身不會有 10+ MB 的字型負擔**。但這解決的是「使用者下載的 PDF 多大」，不解決「伺服器渲染當下，字型來源檔要放在哪裡、佔多少部署包空間」這個問題。
- **自行預先裁切字型的選項**：劇本內容（動作、對白、人物名）用到的中文字通常落在幾千字等級（常用字集 3000–7800 字涵蓋台灣繁中文本的絕大多數場景），用 `fonttools`（Python）的 `pyftsubset` 或 Node 的 `subset-font` 套件可把來源字型檔裁到遠小於原始的 5–20 MB。**這是額外的緩解手段，不是必要手段**——在 Vercel 250 MB／AWS Lambda 250 MB 這種餘裕下，直接塞完整字型檔即可，裁切只在追求更快冷啟動、更小容器映像時才有意義。

### 2. 精確版面控制

- 格式研究（`taiwan-screenplay-format.md`）明確標示：**文化部劇本獎範本（MOC/GHSA）沒有給出邊界公分數、字型名稱、行距數值**——這些數字只在北藝大（TNUA，獨立另一套規範）範本裡出現，**不能拿來冒充文化部規範**。這代表 v1 的「精確版面控制」需求，目前**唯一鎖死的硬性規則只有「12 級字、直式橫書正體中文」**（GHSA 明文），邊界／行距若無法另外取得官方全份徵件須知，可能需要合理猜測一組業界慣用值（如 A4、上下左右 2.5–3 cm 上下）並標記為「待確認」，這是技術選型之外的另一個缺口，已記在格式研究的「不確定與缺口」。
- 在此前提下，**CSS-based 方案（Puppeteer/Playwright、WeasyPrint）能達到的精度綽綽有餘**——`@page` 規則本身就是為「邊界公分數、字級、行距」設計的 CSS 標準屬性，逐項對應毫無問題。
- CJK 標點擠壓／避頭尾：Chromium（Puppeteer/Playwright 底層）作為成熟瀏覽器引擎，`line-break`、`word-break` CSS 屬性與中文排版行為由瀏覽器原生處理，是**目前最成熟的選項**。Typst 有部分支援但標點擠壓仍是已知缺口（官方 issue 追蹤中，2025–2026 仍在討論）。`@react-pdf/renderer` 的 CJK 折行是**已知未修復的開放問題**，不建議在需要精確 CJK 排版時使用。

### 3. 分頁控制

- 格式研究**沒有找到**任何範本對「場次或對白是否需避免被切在頁面邊界」的明文規則——這點在三份範本（MOC/GHSA/TNUA）都沒有觸及，屬於格式研究本身標示的空白，不是本報告漏查。
- 因此這一維度目前是「技術上做得到什麼」而非「規範要求什麼」：
  - Puppeteer/Playwright（CSS `break-inside: avoid`、`break-before`）：**做得到**，且是 CSS 標準屬性，成熟穩定。
  - WeasyPrint：同樣支援 CSS break 屬性（v69 起功能完善）。
  - Typst：`block(breakable: false)` 等原生語法，是其強項。
  - LaTeX：可控但語法不直覺。
  - `@react-pdf/renderer`：`wrap={false}` 等 React props，控制力較弱、無成熟的孤行/寡行（orphans/widows）語意。
- 建議 v1 至少對「對白區塊」與「場次標題+緊接的第一段」套用 `break-inside: avoid` 類語意，即使規範未強制，這是「不追求精美但要被接受」水準線下的低成本合理性加分，不應过度投入。

### 4. 執行環境

- Puppeteer/Playwright 需要 Chromium binary，這是 serverless 上最大的已知摩擦來源：`@sparticuz/chromium`（原 `chrome-aws-lambda` 的後繼、目前主流維護方案，最新版 v149.0.0，2026-05 發布，unpacked 69.7 MB）是業界標準解法，與 `puppeteer-core`（不含自帶 Chromium 的精簡版）搭配使用。這個組合在 Vercel（250 MB 限制）與 AWS Lambda（zip 250 MB／容器 10 GB）都可行；在 Cloudflare Workers（10 MB 限制）不可行，除非改用 Cloudflare Browser Rendering 這個獨立託管服務。
- Vercel Functions 執行時長：Hobby 預設/上限 300 秒，Pro/Enterprise 預設 300 秒、上限 800 秒（beta 可到 1800 秒）——PDF 產生對單一劇本文件而言遠低於此，時長不是瓶頸。記憶體：Hobby 2 GB、Pro/Enterprise 最高 4 GB，對 Chromium+字型渲染而言足夠。
- 冷啟動：Chromium binary 較大，會拉長冷啟動時間（這是 Puppeteer 系方案已知的常態代價，非本次查到精確毫秒數字，見「不確定與缺口」），但劇本匯出屬於使用者主動觸發、可容忍數秒延遲的操作，不是即時互動路徑，可接受。
- `@react-pdf/renderer` 無外部 binary，冷啟動與部署包都輕量，這是它相對 Puppeteer 的核心優勢——但代價是 CJK 排版精度較弱（見上）。

### 5. 多格式擴充性

- 專案常設原則「一條路走通，但不堵死岔路」——v1 只做文化部格式，但要能長出優良劇本獎、北藝大格式。
- **HTML/CSS 路線（Puppeteer/Playwright、WeasyPrint）在這一維度最自然**：格式研究已經把差異點列成清單（場次標題是否含人物、是否加粗、△ 符號、對白排版變體、邊界字型行距等），這些全部可以映射成一組 CSS 變數/樣板檔，「輸出格式」= 選一組 CSS + HTML 模板片段，完全對應 `CONTEXT.md` 對「輸出格式」的定義（「渲染選項，不影響內容本身」）。
- Typst 的模板/函式機制同樣是為參數化設計的，理論上一樣好，但生態成熟度與 Next.js/TS 整合度較低，是額外風險。
- `@react-pdf/renderer` 可用 React props 參數化，但排版引擎本身較弱，換格式時可能重複撞見同一個 CJK 折行限制。
- LaTeX 可參數化但語法門檻高，獨立開發者長期維護多套 `.sty` 模板的成本較高。

### 6. 與 Next.js/TS 契合度與維護負擔

- Puppeteer/Playwright：TS 生態原生支援完整（官方型別），可用 React Server Component 或既有前端元件渲染出 HTML 再轉 PDF，**前後端排版邏輯可共用一套 React 元件/CSS**，這對獨立開發者是顯著的維護負擔減少（不必為 PDF 另開一套排版系統）。
- `@react-pdf/renderer`：一樣是 React/TS，但用的是它自己的一套元件（`<Document>`, `<Page>`, `<Text>` 等），**排版邏輯與網頁預覽用的 React 元件是兩套系統**，維護負擔實際上不比 Puppeteer 路線輕，且還要另外處理 CJK 折行缺陷。
- Typst / LaTeX / WeasyPrint：都需要另開子行程呼叫外部執行檔（或另一個語言的服務），對「獨立開發者、單一 Next.js/TS 專案」而言是額外的技術棧分裂。

---

## 建議

### 首選：Puppeteer / Playwright（HTML → PDF），搭配 `@sparticuz/chromium`，部署在 Vercel 或 AWS Lambda（zip 或容器均可）

理由：
1. CJK 排版精度最高、最成熟（瀏覽器原生排版引擎），格式研究定義的邊界/字級/行距/縮排都能用標準 CSS `@page` 精確對應。
2. 分頁控制（雖非格式硬性要求）用標準 CSS `break-inside` 即可達成。
3. 字型嵌入問題在 2026-08 查證下**已不構成 Vercel／Lambda 部署上的阻礙**（250 MB 空間足夠放完整字型 + Chromium binary），比坊間文章描述的「50 MB 卡死」現況寬鬆得多。
4. 與 Next.js/TS 技術棧無縫（同一套 React/CSS 元件可能與網頁預覽共用），維護負擔最低。
5. 多格式擴充性最佳：換格式＝換一組 CSS/HTML 模板，完全對應「輸出格式＝渲染選項」的資料模型原則。

**但需明講的限制**：這個選擇實質上**排除 Cloudflare Workers（純 Worker 執行模式）作為部署平台**，除非改走 Cloudflare 的 Browser Rendering 獨立服務（另一套產品與計費模型）。若專案之後基於其他理由（成本、edge 延遲）想選 Cloudflare，PDF 匯出這條路徑需要拆成獨立服務（例如另開一個跑在 Vercel/AWS 上的 PDF 產生 API，前端仍架在 Cloudflare），這是技術選型對部署平台的具體反向約束，應該寫進 map.md 的「部署與資料庫託管」考量。

### 第二順位：`@react-pdf/renderer`

理由：純 JS/TS、無外部 binary、部署包最輕、冷啟動最快，且在 Cloudflare Workers 這類嚴格限制的環境下摩擦最小（仍需驗證：把完整字型檔塞進 Worker 是否可行取決於實際字型檔大小是否 < 10 MB，若做過裁切則可能可行）。**代價是 CJK 折行/避頭尾是官方已知的開放缺陷**，若要採用，v1 應規劃自行實作或整合中文斷行前處理（例如渲染前用程式在合適的中文標點處手動插入允許斷行點），這是額外工程量，需要在排期上納入考量。適合作為「如果 Puppeteer 路線在實際部署環境卡關」時的備案，而非目前的首選。

### 不建議：LaTeX、Typst、WeasyPrint、Prince、pdf-lib/Satori（v1 階段）

- **LaTeX**：CJK 排版能力最成熟，但 TeX Live 發行版體積（數百 MB～數 GB）在所有查證過的 serverless 平台上都不可行，除非自架伺服器/容器，這對「獨立開發者、無硬性期限」的專案來說是不成比例的維運負擔。
- **Typst**：CJK 標點擠壓仍是官方追蹤中的缺口，且 Node/TS 生態整合度與社群成熟度目前不如 Puppeteer 路線，屬於「值得關注但現在下注太早」的選項。可留意其後續發展，未來若標點擠壓補齊、且有穩定的 Node binding，可重新評估。
- **WeasyPrint**：技術上可行，但引入 Python 是額外語言棧，對獨立開發者不划算，且未查到其對中文避頭尾規則的原生保證。
- **Prince XML**：商業授權，不符合非商業獨立專案前提。
- **pdf-lib / Satori+resvg**：屬於低階工具或單頁圖片導向工具，不適合多頁長文件排版，等於要自己重新發明排版引擎，工程量與首選方案不成比例。

---

## 主要風險與緩解方式

1. **中文字型嵌入**（已詳述於上）——風險：低（在 Vercel/Lambda 上）。緩解：若未來遷移到 Cloudflare Workers 或發現部署包逼近上限，可用 `pyftsubset`／`subset-font` 預先裁切字型至專案實際用字集（常用字 3000–7800 字），大幅縮小來源字型檔。
2. **`@sparticuz/chromium` 與 Chromium 版本的相依性維護**——這類套件需要跟著 Chromium/Node 版本更新（查證時最新版要求 Node ≥ 22.17.0），獨立開發者需要偶爾跟進升級，否則可能在平台底層 runtime 升級時失效。緩解：訂閱該套件的 release notes，PDF 匯出功能上線後定期（例如每季）檢查相容性。
3. **文化部劇本獎頁面設定數字不完整**（邊界、字型名稱、行距）——這不是技術選型能解決的風險，是格式研究本身標記的資料缺口。緩解：技術方案本身（CSS `@page`）對任何數字都能精確套用，所以一旦拿到官方數字（需另外取得完整徵件須知或詢問主辦單位），套用成本極低，不影響今天的技術選型決策。
4. **冷啟動延遲**（Puppeteer/Playwright 路線）——本次未查到精確的毫秒級數字，只能定性判斷「比純 JS 方案慢」。緩解：PDF 匯出是使用者主動觸發的非即時操作，可接受數秒級延遲；若後續量測發現體驗不佳，可考慮 keep-warm 策略或改走 queue+webhook 非同步匯出模式（超出本票券範圍，留給實作階段决定）。
5. **多格式參數化的實際模板工程量未知**——本報告只論證「HTML/CSS 路線最適合參數化」，但實際把格式研究列出的差異點（△ 符號、對白兩種變體、場次標題含不含人物等）逐一寫成可切換的 CSS/模板變數，是實作階段的工程量，本研究未估算工時。

---

## 不確定與缺口

1. **Noto Sans TC／思源黑體確切檔案大小**——本次查到的「4.5–9 MB／16 MB」數字來自二手技術文章整理，非 Google/Adobe 官方逐字型檔的一手公告數字。實作前應直接下載目標字型檔案確認實際位元組數。
2. **Typst 是否保證只嵌入實際用到的字形（子集化）**——本次查證確認 Typst 有子集化相關機制，但未找到其官方文件明文保證「只嵌入用到的字形」這一行為，信心低於其他三個引擎（PDFKit/fontkit、Chrome/Skia+HarfBuzz、XeLaTeX 皆有明確一手或高信度二手來源佐證）。
3. **Puppeteer/Playwright 在 Vercel Fluid Compute 下的實測冷啟動時間**——未查到具體毫秒數字，只能定性判斷「較慢」，這會影響是否需要 keep-warm 或非同步匯出的架構決策，建議實作階段實測。
4. **Cloudflare Browser Rendering API 是否能滿足本專案的 CJK 字型需求與排版精度**——本報告只確認其存在與計費模式，未實測其字型載入行為（是否可自架字型／是否有字型子集化）與排版精度是否等同本機 Puppeteer，若專案後續認真考慮 Cloudflare 部署，需要另外實測。
5. **AWS Lambda 容器映像路線（10 GB 上限）的冷啟動與成本細節**——本報告只確認其大小上限可行，未深入其冷啟動特性（容器映像通常比 zip 部署冷啟動更慢）與相對 Vercel 的成本比較，這部分留給「部署與資料庫託管」那個更大的地圖迷霧一併決定，不在本票券範圍內深究。
6. **文化部劇本獎完整徵件須知全文**——如格式研究所述，這是格式規範本身的缺口，非技術方案缺口，但會影響技術方案套用時的實際參數值。
