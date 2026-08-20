# PDF 匯出技術方案

Type: research
Status: resolved
Blocked by: 01

## Question

用什麼技術產生符合文化部劇本獎格式的 PDF？中文排版是主要風險。

水準線已定：**拿去參賽會被接受**即可，不追求排版精美。但「被接受」本身就要求版面設定精確，這比想像中難。

候選方案需評估：

- Puppeteer / headless Chrome（HTML → PDF）
- `@react-pdf/renderer`
- Typst
- LaTeX（XeLaTeX + CJK）
- 其他

評估維度：

1. **中文字型嵌入** — 這是最大風險。字型檔案動輒數 MB，serverless 環境（如 Vercel）的部署大小與冷啟動限制能不能撐住？
2. **精確版面控制** — 能不能達到 01 所定義的邊界、字級、行距、縮排規範？
3. **分頁控制** — 場次或對白是否需要避免被切在頁面邊界？台灣格式對此有無要求（若 01 有答案則沿用）
4. **執行環境** — 伺服器端產生還是瀏覽器端？成本與延遲如何？
5. **多格式擴充性** — 之後要支援其他格式時，這個方案好不好參數化？（常設原則）

依賴 01：不知道精確格式規範就無從評估「能不能做到」。

產出：技術選型建議＋主要風險與緩解方式。若中文字型在目標部署環境上不可行，必須明講，因為那會反過來影響部署平台的選擇。

## Answer

完整研究報告：[`../research/pdf-export-tech.md`](../research/pdf-export-tech.md)

### 首選：Puppeteer / Playwright + `@sparticuz/chromium`

理由：CJK 排版精度最高（直接沿用瀏覽器原生引擎）、CSS `@page` 可精確對應格式規範的邊界／字級／縮排、`break-inside: avoid` 可做分頁控制、與 Next.js／React 生態無縫，且**換格式等於換 CSS 模板** — 多格式擴充性最佳，正中常設原則。

**第二順位**：`@react-pdf/renderer`（純 JS、部署包最輕、冷啟動最快），但代價是 **CJK 逐字折行與避頭尾規則是官方已知且未修復的開放缺陷**（GitHub issue #1568、#2917）。

**已排除**：LaTeX（TeX Live 數百 MB～數 GB，serverless 不可行）、Typst（標點擠壓仍是官方追蹤中的缺口）、WeasyPrint（引入 Python 語言棧）、Prince（商業授權）、pdf-lib／Satori（等於自己重造排版引擎）。

### 關鍵修正：50 MB 的說法已過時

網路上常見「Vercel 50 MB 限制卡死 Puppeteer」的說法**已不成立**。查證 Vercel 官方文件（`vercel.com/docs/functions/limitations`，2026-07-01 更新）：現行標準為未壓縮 **250 MB**，另有 beta 的 Large Functions 到 5 GB；AWS Lambda zip 部署硬限制同為 **250 MB**（容器映像可到 10 GB）。

此空間足以同時容納完整 CJK 字型（Noto Sans TC 約 4.5–9 MB／字重，二手數據）與 `@sparticuz/chromium`（v149.0.0 實測 69.7 MB unpacked）。

### 字型大小其實不是真問題

所有候選渲染引擎（PDFKit/fontkit、Chrome Skia+HarfBuzz、XeLaTeX）在輸出階段都會**自動子集化字型**。所以「PDF 檔案多大」從來不是風險 — 真風險是「**渲染當下執行環境能不能讀到完整來源字型檔**」，而這在 Vercel／Lambda 上已不構成阻礙。

### 中文字型 serverless 可行性（明確結論）

- **Vercel、AWS Lambda：可行。**
- **Cloudflare Workers 純 Worker 執行模式：不可行。** Paid plan 每個 Worker 僅 10 MiB，塞不下 Chromium 或完整字型檔。

若日後因成本或 edge 延遲考慮 Cloudflare 作為主要部署平台，PDF 匯出必須拆成獨立跑在 Vercel／AWS 的子服務，或改用 Cloudflare 的 Browser Rendering API（**另一套產品與計費模型，本研究未實測其字型行為**，列為缺口）。

### 對地圖的影響

這條技術路徑**反向約束了部署平台選擇** — 已寫進「部署與資料庫託管」那團霧作為具體邊界條件。
