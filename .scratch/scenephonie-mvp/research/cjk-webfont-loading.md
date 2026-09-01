# Noto Sans TC 的 subset 與載入策略

For: [票券 29](../issues/29-cjk-webfont-loading-strategy.md)

前一輪：[`ui-fonts-cjk.md`](./ui-fonts-cjk.md)。選型已定（self-host Noto Sans TC，v1 只載 Regular 400），本文只回答**怎麼載**。

## 標記約定

- **【實測】**＝本次在本機實際跑指令得到的數字，指令與原始輸出都附在文中。
- **【一手】**＝規格書、官方文件、repo README、套件 registry metadata 等第一方來源。
- **【推估】**＝由實測數字外推，標明推估基礎。
- **【非一手】**＝第三方部落格／二手報導，不作為決策依據。

量測環境：macOS 26（Darwin 25.6.0）、Python 3.9 + fontTools 4.60.2 + brotli、curl，量測日期 2026-09-01。Google Fonts 端點回傳的字型版本為 `notosanstc/v39`。

---

## 0. 摘要（先講結論）

1. **完整 Noto Sans TC Regular 400 的 woff2 是 2.78 MiB【實測】**，不是「10–16MB」——那個數字是未壓縮的 pan-CJK OTF（16.4 MB）。前一輪引用的第三方估算量級對，但套錯了對象。
2. **Google Fonts 的 105 塊切分，一個真實中文頁面要抓的不是「數十 KB」，是 600 KB–1.2 MB【實測】**。前一輪寫的「數十 KB 到數百 KB」**低估了**，本文更正，見第 3 節。
3. **自行複製 Google 的切分是廉價的**：用 `pyftsubset` 依 Google 自己的 105 段 `unicode-range` 切，8 執行緒 **3.9 秒**跑完，總量 2.12 MiB，與 Google 官方 2.14 MiB 幾乎一致【實測】。不需要 `cn-font-split`，也不需要動態伺服器。
4. **`1ic` 在 Noto Sans TC / PingFang TC / Heiti TC 之間完全一致（水 U+6C34 advance 都是 1000/1000 em）【實測】**，所以欄寬不會因字型換手而跳。推論成立。
5. **會跳的是行高與拉丁字寬**，不是欄寬；而修正行高的 `ascent-override` 系列描述子 **Safari 完全不支援**【一手 MDN BCD】，所以正解是「行高寫死成數值」而不是靠 override。
6. **台北黑體官方只發 TTF（Beta），沒有任何 webfont／subset 管線**；社群套件 `vp-tw/taipei-sans-tc` 已 **archived**【一手】。

---

## 1. unicode-range 切分的工具鏈

### 1.1 逐項比較

| 工具 | 維護狀態（2026-09-01 查） | 輸出含 `unicode-range` CSS | 多塊切分 | 需要 Python | 進 Next.js build / CI |
|---|---|---|---|---|---|
| **`fonttools` / `pyftsubset`** | PyPI 最新 **4.64.0，2026-08-31 發版**；GitHub **~5.2k star**，最後 push 2026-08-31 | ❌ 自己不產 CSS（只產字型檔），CSS 要自己寫 | ⭕️ 可以，但要自己寫迴圈（每塊呼叫一次） | ✅ 需要（+ `brotli` 做 woff2） | ⭕️ 可以，但 CI 要多裝一個 Python 環境 |
| **`cn-font-split`** | npm 最新 **7.4.3，2026-06-12**；GitHub **~1.2k star**，最後 push 2026-06-12；Apache-2.0 | ⭕️ 產出 CSS + 分包產物 | ⭕️ 這是它的主功能（「細顆粒度分包」） | ❌ 不需要（Rust/WASM 或 Rust FFI） | ⭕️ 有 `vite-plugin-font`，keywords 明列 `next` / `next-plugin` / `webpack` / `rspack`（基於 `unplugin`） |
| **`subfont`** | npm 最新 **7.2.3，2026-03-21**；GitHub `Munter/subfont` **~1.6k star** | ⭕️ 會直接改寫你的 HTML/CSS | ❌ **不做多塊切分**，是「掃描頁面 → 產生單一精準 subset」 | ❌ 不需要（走 `subset-font` / harfbuzz wasm） | ⚠️ 設計上是 post-build 對**靜態產物**做 assetgraph 追蹤 |
| **`glyphhanger`** | npm 最新 **6.0.0，2026-06-05**；GitHub **~900 star** | ⭕️ `--css` 會吐一個 `@font-face` + `unicode-range` | ❌ 單一 subset | ✅ **需要**（README 明寫 prerequisite 是 `pyftsubset`） | ⚠️ 需要無頭瀏覽器抓頁面用字 |
| **`subset-font`** (Node) | npm 最新 **2.7.0，2026-08-29**；GitHub `papandreou/subset-font` **~150 star** | ❌ 純 library，不產 CSS | ⭕️ 呼叫 N 次即可 | ❌ **不需要**（harfbuzz `hb-subset` 的 wasm build） | ⭕️ 最乾淨的 Node 端積木 |

來源：
[fonttools/fonttools](https://github.com/fonttools/fonttools)、[PyPI fonttools](https://pypi.org/project/fonttools/)、
[KonghaYao/cn-font-split](https://github.com/KonghaYao/cn-font-split)、[npm cn-font-split](https://www.npmjs.com/package/cn-font-split)、[npm vite-plugin-font](https://www.npmjs.com/package/vite-plugin-font)、[中文網字計畫文件站](https://chinese-font.netlify.app/)、
[Munter/subfont](https://github.com/Munter/subfont)、[npm subfont](https://www.npmjs.com/package/subfont)、
[zachleat/glyphhanger](https://github.com/zachleat/glyphhanger)、[npm glyphhanger](https://www.npmjs.com/package/glyphhanger)、
[papandreou/subset-font](https://github.com/papandreou/subset-font)、[npm subset-font](https://www.npmjs.com/package/subset-font)。

> ⚠️ 搜尋 `subfont` 時很容易撞到 `Papandreou/subfont`（0 star、2018 年停更）——那不是本體，本體是 [`Munter/subfont`](https://github.com/Munter/subfont)。【實測：GitHub API 查詢兩個 repo 的 metadata】

### 1.2 幾個關鍵的分類差異

**「掃描用字」型 vs 「頻率分塊」型**，這兩類解決的是不同問題：

- `subfont` / `glyphhanger` 屬**掃描用字型**：靜態分析你的頁面 HTML，算出「這個網站用到哪些字」，切出一個剛剛好的 subset。對行銷頁、部落格極有效，**對本專案無效**——劇本是使用者產生內容，build time 掃不到任何一個劇本裡的字。
- `cn-font-split` / 手寫 `pyftsubset` 迴圈屬**頻率分塊型**：把整個字集依字頻切成 N 塊，各配一段 `unicode-range`，瀏覽器按實際渲染需求抓。這才是 Google Fonts 的做法，也是本專案唯一可用的靜態解。

**`cn-font-split` 的 Next.js 支援**：`vite-plugin-font` 的 npm metadata 中 keywords 含 `next` / `next-plugin` / `webpack` / `rspack`，dependencies 是 `unplugin` + `cn-font-split` + `fontaine` + `cn-font-metrics`【實測：`curl registry.npmjs.org/vite-plugin-font/5.1.2`】。`unplugin` 表示同一份程式碼可掛進 webpack / Rspack，因此理論上可用於 Next.js。但**本次沒有實測它在 Next.js 15/16 App Router 下的行為**，列為未驗證。

**`fonttools` 路線其實不需要「自己想切法」**：Google Fonts 的 CSS 端點已經把切法（105 段 `unicode-range`，依字頻排序）公開了，直接抓下來當切分表用即可。這是第 3 節與第 6 節建議路線的基礎。

---

## 2. 靜態 subset vs 動態 subset

### 2.1 三種做法

| | **A. 靜態頻率分塊**（Google Fonts 式） | **B. 動態 subset**（伺服器依實際用字即時產生） | **C. 常用字先載 + 罕用字 lazy**（兩層／多層靜態） |
|---|---|---|---|
| 首屏成本 | 一頁 600 KB–1.2 MB（實測，見 §3.4）；但可以只 preload 最高頻的 1–2 塊（45–76 KB）先讓九成字有字型 | 理論上最小（只送真正用到的字），但**必須等伺服器算完**才有第一個位元組 | 首載固定（例如 227 KB／3,031 字），其餘按需 |
| 快取行為 | ✅ 最好。每塊是不可變的靜態檔，CDN／瀏覽器可長期快取，跨文件、跨使用者共用 | ❌ 最差。每份文件的 subset 都是獨一無二的 URL，**快取命中率趨近 0**；使用者每打一個新字就等於快取失效 | ✅ 好。第一層是全站共用的靜態檔 |
| 缺字（tofu）風險 | ⭕️ 低。fallback 鏈仍在，未涵蓋的碼位由系統字接手 | ⚠️ 高。伺服器必須知道「文件現在有哪些字」；使用者**正在打的**那個字伺服器還不知道，需要另一輪往返 | ⭕️ 低（同 A） |
| build／伺服器複雜度 | 低（一次性 build step，見 §3.5：3.9 秒） | 高（要跑 runtime、要管冷啟動、要防 DoS——任何人都能用亂數字元組合逼你算 subset） | 低 |
| 需要 CDN | 不需要但強烈受益 | 幾乎沒用（回應不可快取） | 不需要但受益 |
| Vercel | ✅ 純靜態檔，走 `public/`，自動上 CDN | ⚠️ 可行（Node Serverless Function + `subset-font` 的 harfbuzz wasm），但每次請求都是一次 function invocation | ✅ 同 A |
| Cloudflare | ✅ 純靜態檔 | ⚠️ Workers 支援 WASM，但 isolate 記憶體上限 **128 MB**（含 wasm 配置），Free 方案 CPU 上限 **10 ms**、Paid 預設 30 s（可調到 5 min）。把 7 MB 字型讀進來做 subset 在 Free 方案不可行 [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)【一手】 | ✅ 同 A |

### 2.2 對「用字無法預先窮舉」這個情境的判斷

動態 subset 的賣點是「只送真正需要的字」。但它的成立前提是**伺服器先知道用字**。編輯器的場景恰恰相反：

- 使用者按下一個鍵，那個字**此刻**才存在。要嘛每次輸入都去問伺服器要一塊新字型（往返延遲直接體現在打字上），要嘛就退回 fallback 顯示。
- 每份文件的 subset URL 都不同 → CDN 完全不幫忙 → 每個使用者、每份文件都是一次完整的計算與傳輸。
- 靜態分塊在同一個問題上表現好得多：使用者打出一個新字，若它的塊沒載過，瀏覽器**自動**抓那一塊（~21 KB 中位數），而且那塊之後對這個使用者、以及任何其他打到同區字的使用者都是快取命中。

**結論：動態 subset 對本專案是反向優化。** 只有在「內容在伺服器端已知且固定」（例如靜態產生的分享頁、PDF 預覽頁）的路徑上，動態／精準 subset 才有意義——那正好是後路，見第 6 節。

### 2.3 第三種做法確實是業界常態，而且有規格在追

「常用字先載 + 罕用字塊 lazy」就是上表的 C，本質上是 A 的「把最高頻的幾塊合併成一個 preload 檔」。實測數字見 §3.6。

另外值得記錄：W3C **Incremental Font Transfer (IFT)** 正是為了 CJK 這個問題設計的——字型檔內含 patch 索引，client 只抓需要的 patch。目前狀態是 **Candidate Recommendation Draft（2025-11-18）**，[W3C 標準歷程](https://www.w3.org/standards/history/IFT/)、[規格書](https://w3c.github.io/IFT/Overview.html)、[W3C 邀請實作公告（2025）](https://www.w3.org/news/2025/w3c-invites-implementations-of-incremental-font-transfer)【一手】。Chrome 的落地時程與實際節省率本次**查不到一手確認**（搜尋結果指向 blink-dev 的 intent 討論串，但沒有已發布版本的支援聲明）——**不要把 IFT 排進 v1**，只當作「兩年內這條路會變便宜」的背景知識。

---

## 3. 實際體積數字【本節全部為實測】

### 3.1 官方發布檔的大小

```bash
# 用 GitHub API 讀目錄下每個檔案的 size（bytes）
curl -s "https://api.github.com/repos/notofonts/noto-cjk/contents/Sans/OTF/TraditionalChinese"
curl -s "https://api.github.com/repos/notofonts/noto-cjk/contents/Sans/SubsetOTF/TC"
curl -sIL "https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf"
```

| 檔案 | bytes | ≈ | 說明 |
|---|---|---|---|
| `Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf` | 16,435,884 | **15.67 MiB** | 完整 pan-CJK 字符集（含日韓漢字、假名、諺文），TC 語言預設字形 |
| `Sans/SubsetOTF/TC/NotoSansTC-Regular.otf` | 5,683,368 | **5.42 MiB** | 只留 TC 需要的字符（CFF/OTF） |
| `ofl/notosanstc/NotoSansTC[wght].ttf`（google/fonts） | 11,941,968 | **11.39 MiB** | 可變字體，wght 100–900，glyf/TTF |

來源：[notofonts/noto-cjk](https://github.com/notofonts/noto-cjk)（`Sans/` 底下**沒有** `Webfonts` 目錄——官方不發 woff2，實測 `contents/Sans` 只有 `Mono/OTC/OTF/SubsetOTF/SuperOTC/Variable`）、[google/fonts ofl/notosanstc](https://github.com/google/fonts/tree/main/ofl/notosanstc)。

Google Fonts 的 family metadata 也給出同一個數字：

```bash
curl -s "https://fonts.google.com/metadata/fonts"   # familyMetadataList 內 family == "Noto Sans TC"
# → {'family': 'Noto Sans TC', 'category': 'Sans Serif', 'size': 11941968,
#    'lastModified': '2026-01-06', 'popularity': 26, 'isNoto': True}
#   subsets: ['menu','chinese-traditional','cyrillic','latin','latin-ext','vietnamese']
```

### 3.2 我自己壓出來的 WOFF2（單一檔、不分塊）

```bash
# 路線 a：CFF/OTF 來源
curl -sL -o NotoSansTC-Regular.otf \
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf"
python -c "from fontTools.ttLib import TTFont; f=TTFont('NotoSansTC-Regular.otf'); f.flavor='woff2'; f.save('out.woff2')"
# numGlyphs 20950 / cmap 20745 codepoints
# → 4,188,732 bytes

# 路線 b：glyf/TTF 來源（Google 可變字體 instance 到 400）
curl -sL -o NotoSansTC-wght.ttf \
  "https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf"
fonttools varLib.instancer NotoSansTC-wght.ttf wght=400 -o NotoSansTC-400.ttf
# → 7,149,196 bytes（靜態 TTF）
python -c "from fontTools.ttLib import TTFont; f=TTFont('NotoSansTC-400.ttf'); f.flavor='woff2'; f.save('full400.woff2')"
# → 2,910,528 bytes
```

| 來源 | 原始 | → WOFF2 | 壓縮後／壓縮前 |
|---|---|---|---|
| CFF `NotoSansTC-Regular.otf` | 5,683,368 | **4,188,732**（3.99 MiB） | 73.7%（只省 26.3%） |
| glyf `NotoSansTC-400.ttf`（instancer 產物） | 7,149,196 | **2,910,528**（2.78 MiB） | 40.7%（省 59.3%） |

**這是本節最實用的一個發現**：同一個字重、同一批字，**從 glyf/TTF 出發壓 woff2 比從 CFF/OTF 出發小 31%**（2.78 MiB vs 3.99 MiB）。WOFF2 對 glyf 有專屬的 transform，對 CFF 沒有。前一輪引用的「WOFF2 對 CJK 只能壓 30–40%」【非一手】在 CFF 路線上大致成立（實測 26%），但**在 glyf 路線上是錯的**（實測省 59%）。

→ **pipeline 的來源檔請用 `google/fonts` 的 `NotoSansTC[wght].ttf` instance 到 400，不要用 noto-cjk 的 OTF。**

### 3.3 Google Fonts CSS API 的切分結構

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400&display=swap" -o notosanstc.css
wc -c notosanstc.css            # 122810
grep -c "@font-face" notosanstc.css     # 105
grep -c "unicode-range" notosanstc.css  # 105
grep -o 'https://fonts.gstatic.com/[^)]*woff2' notosanstc.css > urls.txt
# 對 105 個 URL 逐一 curl -sI 取 Content-Length
```

原始統計輸出：

```
chunks=105 total_codepoints_covered=16942 total_bytes=2247576 (2.14 MiB)
size min/p25/median/p75/max KB: 1.1 15.3 21.2 26.5 44.6
codepoints per chunk min/median/max: 102 135 1162
```

- **105 塊**，單一字重 400，`font-display: swap`（Google 依 URL 參數回填）。
- 每塊 **1.1 KB – 44.6 KB，中位數 21.2 KB**。CJK 塊大多是「213 個碼位／約 18–30 KB」。
- 全部塊加總 **2,247,576 B = 2.14 MiB**，涵蓋 16,942 個碼位。
- **塊是依字頻排序的**：索引 100 是最高頻塊，往 0 遞減。實測 `的一是不我日` 都在塊 100，`了你他們這場內外天` 在 99，`那白` 在 98，`景黑` 在 97，`夜` 在 96。
- 索引 101–104 是 latin / latin-ext / cyrillic / vietnamese（合計 27 KB）。
- **基本拉丁字母同時出現在塊 104 和塊 100**（688 個碼位有重複指派；漢字則完全不重複，實測 CJK 統一表意文字區沒有任何一個碼位落在兩塊）。依 CSS 串接規則，重複時後出現的 `@font-face` 勝出，所以拉丁字實際會抓塊 104。

### 3.4 一個真實中文頁面要抓多少？

用本專案 `.scratch/` 下的繁中 markdown 當語料（技術散文，非劇本對白，只是代理），把每個相異字元對到它的塊，加總那些塊的實際 `Content-Length`：

| 語料 | 相異字元數 | 需要的塊數 | Google 官方塊加總 | 我自建塊加總 |
|---|---|---|---|---|
| `taiwan-screenplay-format.md`（單篇） | 570 | 18 / 105 | **627 KB** | 621 KB |
| `ui-fonts-cjk.md`（單篇） | 654 | 22 / 105 | **739 KB** | 733 KB |
| `.scratch/` 全部 50 個 md（≈ 一部長劇本的用字量級） | 1,844 | 50 / 105 | **1,264 KB** | 1,251 KB |

**所以：一個「數百到一千餘個相異字」的中文編輯器頁面，用 Google 式 105 塊切分，首屏字型傳輸量落在 600 KB – 1.3 MB。**

這比前一輪寫的「數十 KB 到數百 KB」高了一個量級。原因很直白：**塊的顆粒度是 213 個字，但一頁只會用到其中幾十個**——你為了 30 個字付了 213 個字的錢。相異字愈分散，浪費愈大。

作為對照，同樣這批字**不分塊、直接精準 subset 成單一檔**：

```bash
pyftsubset NotoSansTC-400.ttf --unicodes-file=<該篇的所有碼位> --flavor=woff2 -o out.woff2
```

| 語料 | 碼位數（含拉丁與標點補集） | glyf 來源 | CFF 來源 |
|---|---|---|---|
| `ui-fonts-cjk.md` | 676 | **95,884 B（94 KB）** | 131,480 B（128 KB） |
| `.scratch/` 全部 | 1,848 | **271,136 B（265 KB）** | 381,320 B（372 KB）|

精準 subset 是 94 KB，分塊要 739 KB——**分塊的代價大約是 6–8 倍**。這就是「用字無法預先窮舉」要付的保險費。第 6 節會說明怎麼把這筆費用壓下來。

### 3.5 自建 105 塊的成本

拿 Google 自己那 105 段 `unicode-range` 當切分表，對 `NotoSansTC-400.ttf` 跑 `pyftsubset`（8 執行緒）：

```
own chunks total bytes 2220936  (2.118 MiB)
./venv/bin/python chunkbuild.py  26.43s user 2.42s system 746% cpu  3.867 total
```

- **總量 2,220,936 B（2.12 MiB），與 Google 官方的 2,247,576 B 差 1.2%。**
- **牆鐘 3.9 秒**（單機、8 執行緒、fontTools 4.60.2，未開快取）。
- 逐塊比對，自建塊在每個頁面情境下都比 Google 略小 0.5–1%（見 §3.4 右兩欄）。

**這回答了「self-host 時要怎麼複製 Google 的做法」：抓它的 CSS，用它的 unicode-range 表，跑 105 次 pyftsubset。四秒。** 不需要引入 `cn-font-split`，也不需要自己發明字頻分組演算法。

### 3.6 「常用字先載」到底能買到多少？

以 `.scratch/` 語料的**字元出現次數**（334,196 個非空白字元）計算累積覆蓋率，塊依字頻由高到低載入（用自建塊的大小）：

| 已載塊數 | 累積大小 | 字元覆蓋率 |
|---|---|---|
| 1（塊 104，純拉丁） | 14 KB | 38.03% |
| 4（拉丁四塊） | 27 KB | 38.03% |
| 5（＋最高頻 CJK 塊） | **45 KB** | **55.26%** |
| 6 | 76 KB | 76.18% |
| 7 | 110 KB | 85.01% |
| 9 | **185 KB** | **94.01%** |
| 12 | 303 KB | 97.61% |
| 14 | 382 KB | 98.65% |
| 19 | 566 KB | 99.53% |
| 24 | **735 KB** | **99.76%** |
| 34 | 775 KB | 99.94% |
| 105（全部） | 2,169 KB | 99.99% |

另外，把「最高頻的 N 個碼位」合併成**單一檔**（不分塊）：

| 碼位數 | woff2 大小 |
|---|---|
| 1,510（幾乎都是拉丁／西里爾） | 16 KB |
| 2,192 | 90 KB |
| 3,031（≈ 1,370 個常用漢字＋拉丁） | **227 KB** |
| 5,146（≈ 3,480 個常用漢字＋拉丁） | **530 KB** |

**推估【推估】**：語料是技術散文，劇本對白的用字分布會更集中（口語常用字比例更高、專有名詞更少），所以同樣的塊數在劇本上覆蓋率應**不低於**上表。但**沒有實測劇本語料**，這是本文最大的量測缺口。

---

## 4. `font-display`、FOUT/FOIT 與字面差異

### 4.1 各值的語意【一手】

MDN [`font-display`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display) 的定義（三個時期：block period 顯示**不可見**的 fallback、swap period 顯示 fallback、failure period 放棄）：

| 值 | block period | swap period |
|---|---|---|
| `auto` | 由 UA 決定 | 由 UA 決定 |
| `block` | short | infinite |
| `swap` | extremely small | infinite |
| `fallback` | extremely small | short |
| `optional` | extremely small | **none** |

MDN 明確表示規格**沒有寫死**「short」「extremely small」的秒數，只提到 Firefox 用 `gfx.downloadable_fonts.fallback_delay` / `fallback_delay_short` 兩個 pref 控制。常見引用的「3 秒／100 毫秒」是實作慣例而非規格值——**不要當成規格數字引用**。

支援度：`font-display` Chrome 60 / Firefox 58 / Safari 11.1【一手 MDN BCD】。

### 4.2 編輯器情境的取捨（而非行銷頁）

編輯器和行銷頁有一個決定性的差異：**分塊載入不是只發生在首屏，而是持續發生在打字過程中**。

使用者打出一個目前沒載過的塊裡的字（例如一個罕見地名、一個角色的僻字名），瀏覽器才會去抓那塊（中位數 21 KB）。於是：

- **`optional`**：❌ 對編輯器是災難。swap period 為 none，代表若字型沒能在極短的 block period 內到位，該次渲染**永遠**用 fallback。結果是同一頁裡「先打的字是 Noto、後打的字是蘋方」的混排，而且不會自我修復。
- **`block`**：❌ 打字時會出現**不可見的字**（block period 顯示 invisible fallback）。使用者按了鍵、螢幕上什麼都沒有——在寫作工具裡這是最不能忍的失敗模式。
- **`fallback`**：⚠️ swap period 是 short，網路差時新塊會永久停在 fallback，症狀同 `optional` 但較輕。
- **`swap`**：✅ 極短 block period（幾乎不會看到空白）＋無限 swap period（塊一到就換上，一定會自我修復）。新打的字先以蘋方／正黑體顯示，21 KB 到位後換成 Noto。
- **`auto`**：❌ 不可預測，別用。

**建議 `font-display: swap`**，並用 preload 把最高頻幾塊在首屏就拿到（§3.6：9 塊 = 185 KB 就覆蓋 94% 的字元），把「打字中換字型」的機率壓到個位數百分比。這也正是 Google Fonts 自己在 `css2` 端點回傳的預設。

### 4.3 字面差異的實際量化【實測】

用 fontTools 直接讀 `head` / `OS/2` / `hhea` / `hmtx`（PingFang 取自本機 `/System/Library/AssetsV2/…/PingFang.ttc`，Heiti 取自 `/System/Library/Fonts/STHeiti Medium.ttc`）：

| 度量（單位 em，upm 皆為 1000） | **Noto Sans TC 400** | **PingFang TC Regular** | Heiti TC Medium |
|---|---|---|---|
| hhea ascent / descent / lineGap | 1.160 / −0.288 / 0 | 1.060 / −0.340 / 0 | 0.860 / −0.140 / 0.030 |
| OS/2 typo asc / desc / gap | 0.880 / −0.120 / 0 | 0.860 / −0.140 / **0.400** | 0.860 / −0.140 / 0.030 |
| OS/2 win asc / desc | 1.160 / 0.288 | 1.060 / 0.340 | — |
| **x-height** | **0.543** | **0.600** | — |
| **cap height** | **0.733** | **0.860** | — |
| **advance 水 U+6C34** | **1.0000** | **1.0000** | **1.0000** |
| advance 一 U+4E00 / 國 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / — |
| advance `H` | 0.728 | 0.720 | — |
| advance `x` | 0.498 | 0.509 | — |
| advance `0` | 0.555 | 0.600 | — |

由此可以精確說出**換手時會跳什麼、不會跳什麼**：

1. **中文字寬：不跳。** 全形字 advance 兩邊都是 1.000 em。整行漢字的長度完全一致。
2. **行高：跳 3.4%。** 若 `line-height: normal`，內容區高度 = ascent + descent：Noto 為 1.448 em，PingFang 為 1.400 em，差 **+3.43%**。一頁 40 行就是約一行半的位移。
3. **拉丁字寬：跳。** 數字 `0` 差 8.1%（0.555 vs 0.600），`x` 差 2.2%，`H` 差 1.1%。場次號、時間碼、`INT.`／`V.O.` 這類拉丁片段的寬度會抖動，但它們在劇本裡是短片段，影響有限。
4. **視覺大小感：差很多。** PingFang 的 x-height 比 Noto 大 10.5%（0.600 vs 0.543）、cap height 大 17.3%。同樣 `font-size`，蘋方的西文看起來明顯比 Noto 大一號。這是**觀感**的跳動，不是版面的跳動。

### 4.4 能不能用 `@font-face` 描述子修掉？

**先看支援度**【一手，MDN browser-compat-data，`css/at-rules/font-face.json`，2026-09-01 讀取】：

| 描述子 | Chrome | Firefox | **Safari** |
|---|---|---|---|
| `ascent-override` | 87 | 89 | **不支援** |
| `descent-override` | 87 | 89 | **不支援** |
| `line-gap-override` | 87 | 89 | **不支援** |
| `size-adjust` | 92 | 92 | 17 |
| `unicode-range` | 1 | 36 | 3.1 |

這直接推翻了「用 metric override 對齊 fallback」這條路：**PingFang 只出現在 Apple 平台，而 Apple 平台的瀏覽器引擎（WebKit）不支援 `ascent-override` 家族**。你要修的那個 fallback，正好在唯一不支援修法的平台上。

再看 `size-adjust`：MDN 說明它是「glyph outlines 與 metrics 的乘數」，**會縮放 glyph advance**（[MDN size-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/size-adjust)）。若為了對齊 x-height 而對蘋方下 `size-adjust: 90.5%`（543/600），**水 U+6C34 的 advance 會跟著變成 0.905 em，`1ic` 就不再等於 `1em`，欄寬立刻開始跳**。也就是說：

> **在 CJK 版面裡，`size-adjust` 修的是你不在乎的東西（x-height），弄壞的是你在乎的東西（ic 欄寬）。不要用。**

**正確的緩解手段是把行高從字型度量裡解耦**：`line-height` 寫成無單位數值（例如 `1.8`），行盒高度就等於 `1.8 × font-size`，與 ascent/descent 無關，§4.3 第 2 點的 3.43% 跳動直接歸零，而且在所有瀏覽器上都成立。剩下的拉丁字寬與觀感差異無法消除，只能靠「首屏就把高頻塊 preload 到位」縮短暴露時間。

另一個**可以**在 Safari 上用的工具是 CSS Fonts 5 的 `font-size-adjust: <metric> <number>`（例如 `ic-width 1`）：Chrome 127 / Firefox 92 / Safari 17【一手 MDN BCD `css/properties/font-size-adjust.json`，two-values 條目】。它是**屬性**不是描述子，作用在元素上。本次**沒有實測**它在 Noto↔蘋方切換時的行為，列為待驗證的岔路。

### 4.5 `ic` 單位的驗證【本題的直接答案】

規格【一手，[CSS Values 4 §ic](https://www.w3.org/TR/css-values-4/#ic)】：

> "Represents the typical advance measure of CJK letters, and measured as the used advance measure of the 「水」 (CJK water ideograph, U+6C34) glyph found in the font used to render it."
> "In the cases where it is impossible or impractical to determine the ideographic advance measure, it must be assumed to be 1em."

實測（§4.3 表）：**Noto Sans TC 400、PingFang TC Regular、Heiti TC Medium 的 U+6C34 advance 全部是 1000/1000 upm = 1.0000 em。**

因此：

- **推論成立。** `1ic` 在整條 fallback 鏈上都等於 `1em`，字型換手時 `width: 40ic` 這種欄寬**不會跳**。
- 更強的結論：在這個字型組合下 **`ic` 是退化的**——它等價於 `em`。用 `ic` 的價值不在數值，而在**語意**（宣告「這個寬度是幾個全形字」）以及**對未來字型的保險**（若日後換一個 U+6C34 不是全形的字型，`ic` 會自動跟上，`em` 不會）。
- **`font-display` 的選擇完全不影響這一點。** `ic` 的定義是「the font used to render it」，無論當下渲染用的是 Noto 還是蘋方，量到的都是 1.0 em。`swap` / `block` / `optional` 之間的差別只影響**何時**換字型，不影響 `ic` 的值。
- ⚠️ 未量到的一個 case：**微軟正黑體**。本機是 macOS，拿不到 `msjh.ttc`，**沒有實測** Microsoft JhengHei 的 U+6C34 advance。理論上全形字在中文字型裡都是全形，但這是**未驗證的推論**，建議在 Windows 機器上補一次量測。
- 支援度【一手 MDN BCD `css/types/length.json`】：`ic` = Chrome 106 / Firefox 97 / Safari 15.4；`ric` = Chrome 111 / Firefox 147 / Safari 17.2。老瀏覽器需要 `width: 40em; width: 40ic;` 這種兩行寫法墊底。

### 4.6 `next/font/local` 的取捨【一手】

依 [Next.js Font API Reference](https://nextjs.org/docs/app/api-reference/components/font)（v16.3.4 文件）：

`next/font/local` 支援的 key：`src`、`weight`、`style`、`display`、`preload`、`fallback`、`adjustFontFallback`、`variable`、`declarations`。**`subsets` 與 `axes` 只有 `next/font/google` 有。**

它提供什麼：

- ✅ **自動 self-host**：字型檔進 build 產物、自動加 hash、自動產 `@font-face`、自動注入 `<link rel="preload">`（`preload: true` 為預設）。
- ✅ **`display`**：預設就是 `'swap'`。
- ✅ **`declarations`**：可塞任意 `@font-face` 描述子，文件的範例就是 `[{ prop: 'ascent-override', value: '90%' }]`。**理論上也可以塞 `unicode-range`。**
- ⚠️ **`adjustFontFallback`（local 版）**：文件寫「possible values are `'Arial'`, `'Times New Roman'` or `false`. The default is `'Arial'`」。**只有這兩個拉丁字型可選，對 CJK 完全無用**；預設值 `'Arial'` 會產生一個以 Arial 為基礎、帶 metric override 的 fallback face，對中文毫無意義（而且 override 在 Safari 無效）。**應該設成 `false`。**
- ❌ **不支援多個 `unicode-range` 區塊。** `src` 陣列的元素型別是 `{path, weight?, style?}`，沒有 `unicodeRange`。`declarations` 是**整個 `localFont()` 呼叫**共用的一組描述子，也就是說一次呼叫只能產出一個 `unicode-range`。

**這是關鍵限制**：105 塊（或 N 塊）的分塊載入**無法**用單一次 `localFont()` 表達。

可能的繞法（**未實測，列為推測**）：呼叫 `localFont()` N 次、每次 `declarations: [{prop:'unicode-range', value: '...'}]`，再把 N 個 `.style.fontFamily` 串成一條 `font-family` 清單——因為 CSS 的 font fallback 本來就是逐字元往後找。缺點是 N 個獨立 family 名、N 個 preload hint（首屏會被全部 preload，除非逐一 `preload: false`），以及 CSS 變數會變得極醜。

**取捨結論**：
- 若走**單一精準 subset**（例如只覆蓋常用字的一個檔）→ 用 `next/font/local`，設 `display:'swap'`、`adjustFontFallback:false`、`variable:'--font-body'`，最省事。
- 若走**多塊 unicode-range** → **自己寫 `@font-face`**（一份 build 產生的 `.css` 放進 `app/layout.tsx` 或 `globals.css`，字型檔放 `public/fonts/`），配一兩個手寫的 `<link rel="preload" as="font" type="font/woff2" crossorigin>` 指向最高頻的幾塊。放棄 `next/font` 的自動化，換取對 `unicode-range` 的控制。

---

## 5. 台北黑體 Taipei Sans TC 的官方 webfont 狀態

**只講事實，不重做選型。**

### 5.1 官方（翰字鑄造 JT Foundry）

- 官方發布管道是 Google Sites 的下載頁：[翰字鑄造 JT Foundry — 下載](https://sites.google.com/view/jtfoundry/zh-tw/downloads)。頁面明寫**「字型格式為 TTF」**，下載連結指向 Google Drive 資料夾，標示為 **"Taipei Sans TC Beta"**。
- 該頁**沒有任何** webfont、WOFF2、subset 或 CDN 的敘述。**官方沒有維護 webfont／subset 發布管線。**
- **不在 Google Fonts 上**：實測 `curl -s https://fonts.google.com/metadata/fonts` 共 1,946 個 family，`'Taipei' in family` 的結果是**空集合**。
- 官方頁面**沒有**版本號、發布日期、更新紀錄。「是否隨上游思源黑體更新」——**查不到任何一手證據**；能查到的只有「仍標示為 Beta」這一個事實。

### 5.2 社群套件

- **`vp-tw/taipei-sans-tc`**：GitHub API 實測 `archived: true`、37 star、最後 push 2026-08-26。README 明寫「no longer maintained」，並導向後繼專案。npm `@vp-tw/taipei-sans-tc` 最後發版 **0.2.0 / 2026-07-28**。內容形式是**帶 `unicode-range` 的 WOFF2 subset**，含 Light / Regular / Bold 三個字重，字型本體是 **Beta 版**；README 說切分用 Python `font-splitter`，字型 OFL 1.1、程式碼 MIT。[repo](https://github.com/vp-tw/taipei-sans-tc)
- **後繼者 `vp-tw/cjk-web-fonts`**：未 archived，最後 push 2026-08-27，**0 star**。對應套件 `@vp-tw/cjk-web-fonts-taipei-sans-tc` 目前只有 **0.0.1，發布於 2026-08-24**，描述為 "Taipei Sans TC webfont subsets in light, regular, and bold weights."【實測 npm registry】
- **`VdustR/taipei-sans-tc`**（npm `taipei-sans-tc`）：最後發版 **0.1.1 / 2019-07-21**，已停更七年。

### 5.3 一句話總結

台北黑體目前**沒有任何官方或穩定的 webfont 供應鏈**：官方只發 Beta TTF；唯一成熟的社群 webfont 套件已封存；接替者是三天前發布的 0.0.1、零 star。要用它就必須自己跑 subset pipeline——但那條 pipeline 和 Noto 用的是**同一條**（見第 6 節），所以這不構成技術障礙，只構成**維護風險**（上游是 Beta，沒有版本號，沒有更新承諾）。

---

## 6. 建議的載入策略

### 6.1 主線：**兩層靜態切分，自己 build，走 Next.js 的 `public/` 與手寫 `@font-face`**

```
來源：google/fonts 的 NotoSansTC[wght].ttf
  → fonttools varLib.instancer wght=400        （7.15 MB 靜態 TTF）
  → 依 Google css2 端點的 105 段 unicode-range 切成 105 個 woff2   （總計 2.12 MiB，build 耗時 3.9 秒）
  → 另外把最高頻的前 9 塊「原樣」列為 preload 目標               （185 KB，覆蓋 94% 字元）
產物：public/fonts/noto-sans-tc/*.woff2 + 一份 generated 的 fonts.css（105 個 @font-face，font-display: swap）
```

CSS 骨架：

```css
/* generated — 105 blocks */
@font-face{
  font-family:"Noto Sans TC";font-style:normal;font-weight:400;font-display:swap;
  src:url(/fonts/noto-sans-tc/100.woff2) format("woff2");
  unicode-range:U+2e,U+3001,…;   /* 直接沿用 Google 的切分表 */
}
/* …另外 104 塊… */

:root{
  --font-body:"Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC",sans-serif;
  --font-ui:var(--font-body);
}
.screenplay{
  font-family:var(--font-body);
  line-height:1.8;          /* 無單位數值 —— 讓行盒高度與字型度量脫鉤，消掉 3.43% 的行高跳動 */
  width:40em; width:40ic;   /* ic 在三個候選字型上都 = 1em，換手不跳；em 是老瀏覽器墊底 */
}
```

`<head>` 只 preload 最高頻那幾塊：

```html
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/noto-sans-tc/100.woff2">
<!-- …塊 99、98、97、96、104… 共約 185 KB -->
```

### 6.2 為什麼是這條

1. **這是唯一能處理「用字不可窮舉」的靜態解**（§2.2）。掃描型工具（subfont、glyphhanger）在 build 時看不到任何劇本內容，動態 subset 的快取命中率趨近 0 且把打字延遲搬到網路上。
2. **成本已經實測過，是可接受的**：build 3.9 秒，總產物 2.12 MiB 靜態檔（比 Next.js 一般的 JS bundle 還小得多），首屏 preload 185 KB 換到 94% 的字元覆蓋，其餘塊按需拉、每塊中位數 21 KB。
3. **來源用 glyf TTF 而非 CFF OTF，白省 31%**（§3.2）。
4. **不引入新依賴的維護面**：切分表直接抄 Google 的（一次性存進 repo），切分工具是 `fonttools`——PyPI 上 2026-08-31 剛發版、5.2k star 的基礎設施，不是單人專案。
5. **平台中立**：產物是純靜態 woff2。Vercel、Cloudflare Pages/Workers、任何 CDN、甚至 `next export` 都一樣跑。這條路線**不會**替票券 25（部署平台）預先關門。
6. **`font-display: swap`** 是編輯器情境唯一不會產生「按了鍵沒東西」或「字型永久混排」的值（§4.2）。
7. **不使用 `size-adjust` / `ascent-override` 系列**：前者會破壞 `ic`，後者在 Safari 根本不生效（§4.4）。行高用無單位數值解決。

### 6.3 它保留了哪些後路

| 後路 | 為什麼還開著 |
|---|---|
| **換成單一精準 subset** | 若日後決定「編輯器只保證常用字」，直接把 105 塊換成 §3.6 的單檔（3,031 碼位 = 227 KB，或 5,146 碼位 = 530 KB），CSS 從 105 個 `@font-face` 收成 1 個，改的是 build script 的一個參數。此時 `next/font/local` 也重新變成可用選項。 |
| **改切分顆粒度** | 切分表是我們 repo 裡的一份資料，不是 Google 的黑箱。想把 213 字/塊改成 100 字/塊（降低單塊浪費、提高塊數）只要換表重跑，4 秒。 |
| **改用 `cn-font-split` / `vite-plugin-font`** | 產物介面相同（woff2 + unicode-range CSS）。若哪天 Python 在 CI 變成負擔，換成 Rust/WASM 的 `cn-font-split` 只需替換 build step，CSS 使用端不動。 |
| **加字重** | v1 只有 400。加 500/700 就是同一條 pipeline 多跑兩次 instancer + 切分，成本線性（每個字重約 2.1 MiB 產物、4 秒）。 |
| **換字型（含台北黑體）** | Pipeline 對來源字型是無知的。要試台北黑體，把來源檔換成它的 TTF 重跑即可——這正好抵銷了第 5 節那個「沒有官方 webfont 管線」的問題。 |
| **對已知內容做精準 subset** | 分享頁、PDF 預覽頁這類**伺服器端已知內容**的路徑，可以另外跑一次精準 subset（94 KB 級距），與編輯器的分塊策略並存、互不干擾。 |
| **接 IFT** | 若 Chrome 落地 Incremental Font Transfer，來源檔（instancer 產出的靜態 TTF）可以直接餵給 IFT 編碼器，切分表作廢但來源不變。 |

### 6.4 明確不建議

- ❌ 動態／伺服器端即時 subset（§2.2）。
- ❌ `font-display: optional` 或 `block`（§4.2）。
- ❌ 對 CJK fallback 用 `size-adjust`（會破壞 `ic`，§4.4）。
- ❌ 依賴 `ascent-override` / `descent-override` / `line-gap-override`（Safari 不支援，而蘋方只在 Safari 的地盤上出現）。
- ❌ `next/font/local` 的 `adjustFontFallback` 預設值 `'Arial'`（對 CJK 無意義；若用 `next/font/local` 請顯式設 `false`）。

---

## 7. 仍然存在的缺口

1. **沒有劇本語料的實測。** §3.4 / §3.6 用的是本專案的技術散文 markdown。劇本對白的字頻分布應更集中，但**未驗證**。等有真實劇本樣本（哪怕十份）就該重跑一次 §3.6 的覆蓋率表，據以決定 preload 幾塊。
2. **微軟正黑體的 U+6C34 advance 未實測**（§4.5）。本機是 macOS。需要一台 Windows 機器跑一次 fontTools 讀 `msjh.ttc` 確認 `1ic == 1em`。同時可順便量它的 ascent/descent，補完 §4.3 的表。
3. **`vite-plugin-font` 在 Next.js 15/16 App Router 下未實測**（§1.2）。keywords 與 `unplugin` 依賴顯示它應該可以，但沒跑過。
4. **`next/font/local` 多次呼叫 + `declarations` 塞 `unicode-range` 的繞法未實測**（§4.6）。若驗證可行，主線可以改回 `next/font`，換到自動 preload 與 hash。
5. **`font-size-adjust: ic-width 1` 的實際行為未實測**（§4.4）。它是唯一在 Safari 上可用的度量對齊工具，值得在 prototype 階段花十分鐘試。
6. **IFT 的 Chrome 實際支援版本查不到一手確認**（§2.3）。W3C 的 CR Draft 狀態是確定的（2025-11-18），瀏覽器落地時程不是。
7. **台北黑體是否隨上游思源黑體更新，查不到任何一手證據**（§5.1）。官方頁面沒有版本號、沒有更新紀錄、仍標 Beta。
8. **Windows ClearType 下的渲染品質未驗證**（前一輪就有的缺口，本次沒有補上）。需要實機截圖。
9. **首屏「傳輸量」不等於「首屏時間」**：本文全部是 bytes，沒有量任何 LCP / FCP。185 KB 的 preload 在 4G 上大約需要多久、對打字流暢度的實際影響，需要在 prototype 上用真實裝置量。

---

## 附錄：本文所有實測指令

```bash
# 1) Google Fonts CSS API（Chrome UA 才回 woff2）
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400&display=swap" -o notosanstc.css
grep -c "@font-face" notosanstc.css            # 105
grep -o 'https://fonts.gstatic.com/[^)]*woff2' notosanstc.css > urls.txt
while read -r u; do curl -sI -A "$UA" "$u" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}'; done < urls.txt
# → 加總 2,247,576 bytes；min 1160 / max 45692 / median ~21.2 KB

# 2) 官方發布檔大小
curl -s "https://api.github.com/repos/notofonts/noto-cjk/contents/Sans/OTF/TraditionalChinese"
curl -s "https://api.github.com/repos/notofonts/noto-cjk/contents/Sans/SubsetOTF/TC"
curl -s "https://api.github.com/repos/notofonts/noto-cjk/contents/Sans"        # 確認沒有 Webfonts 目錄
curl -s "https://fonts.google.com/metadata/fonts"                               # Noto Sans TC size / lastModified

# 3) 建立 400 字重的靜態來源並壓 woff2
python -m venv venv && ./venv/bin/pip install "fonttools[woff]" brotli
curl -sL -o NotoSansTC-wght.ttf "https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf"
./venv/bin/fonttools varLib.instancer NotoSansTC-wght.ttf wght=400 -o NotoSansTC-400.ttf
./venv/bin/python -c "from fontTools.ttLib import TTFont;f=TTFont('NotoSansTC-400.ttf');f.flavor='woff2';f.save('full400.woff2')"

# 4) 依 Google 的 unicode-range 表自建 105 塊（8 執行緒）
#    每塊：pyftsubset NotoSansTC-400.ttf --unicodes-file=<該塊 range> --flavor=woff2 -o <i>.woff2
#    → 總計 2,220,936 bytes，牆鐘 3.867 s

# 5) 精準 subset 對照
./venv/bin/pyftsubset NotoSansTC-400.ttf --unicodes-file=<某篇文章的所有碼位> --flavor=woff2 -o out.woff2

# 6) 字型度量
./venv/bin/python -c "from fontTools.ttLib import TTFont; …讀 head/OS2/hhea/hmtx…"   # Noto
#   PingFang: /System/Library/AssetsV2/com_apple_MobileAsset_Font8/<hash>.asset/AssetData/PingFang.ttc
#   Heiti:    /System/Library/Fonts/STHeiti Medium.ttc

# 7) 瀏覽器支援度（MDN browser-compat-data 一手資料）
curl -s "https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/font-face.json"
curl -s "https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/types/length.json"
curl -s "https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/font-size-adjust.json"
```

量測用的暫存目錄（venv、12 MB 來源字型、105 個 woff2）已刪除，未進版控。上列指令可完整重現本文所有數字。
