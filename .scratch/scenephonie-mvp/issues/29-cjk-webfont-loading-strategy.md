# Noto Sans TC 的 subset 與載入策略

Type: research
Status: resolved
Blocked by:

## Question

[票券 26](./26-ui-visual-direction.md) 定了 `--font-body` = **self-host Noto Sans TC**（SIL OFL 1.1，可自由商用與 self-host），且 **v1 只載 Regular 400 一個字重**。未決的是**怎麼載**。

繁中完整字集達 10MB+ 級，而 WOFF2 對 CJK 的壓縮率只有約 30–40%（拉丁約 50%），所以載入策略是這個選擇的**主要成本**，不是實作細節。

### 要回答

1. **unicode-range 切分**：Google Fonts 把每個字重切成數十至上百個小 woff2 塊、瀏覽器只抓用到的字 —— 我們 self-host 時要怎麼複製這個做法？有沒有現成工具鏈（`fonttools`／`subset-font`／`cn-font-split` 之類）？
2. **靜態 subset vs 動態 subset**：劇本是使用者產生的內容，用字無法預先窮舉。靜態切分（依字頻分塊）與動態（伺服器依實際用字產生）各自的代價。
3. **實際體積數字**：切分後首屏實際傳輸量的級距。⚠️ 前一輪調研已標記這項「未實測」。
4. **FOUT／FOIT 的處理**：字型未到位時的 fallback 呈現，以及它與 fallback 鏈 `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif` 的字面差異造成的跳動。
5. **台北黑體的官方 webfont 狀態**（前一輪未查到）。

## 材料

📄 [`../research/ui-fonts-cjk.md`](../research/ui-fonts-cjk.md) —— 前一輪調研，第 4 節列出五項缺口。

## 它擋什麼

**不擋任何東西**，可平行跑。字型**選型**已定，本票只影響它的交付方式。

## Answer

**2026-09-01，research 子代理實測定案。** 調研檔：📄 [`../research/cjk-webfont-loading.md`](../research/cjk-webfont-loading.md)（522 行，所有數字附可重現的指令，見其附錄）。

本票**不產生不變式，不開 ADR** —— 比照[票券 27](./27-ui-component-layer.md) 的門檻。它決定的是既有選型（Noto Sans TC 400）的**交付方式**，不是領域規則。

### 0. 先更正前一輪調研的三個數字

[`ui-fonts-cjk.md`](../research/ui-fonts-cjk.md) 有三處引用了第三方估算，本次實測後**應以此處為準**：

| 前一輪 | 實測 | 錯在哪 |
|---|---|---|
| 完整字集「10–16MB 級」 | **Noto Sans TC Regular 400 的 woff2 = 2.78 MiB** | 16.4 MB 是未壓縮的 **pan-CJK OTF**，量級對但**套錯對象**（那不是我們要送的檔） |
| 走分塊「首屏數十 KB 到數百 KB」 | **600 KB – 1.3 MB** | **低估一個量級**。塊的顆粒度是約 213 字，一頁只用到其中幾十個 —— 為 30 個字付 213 個字的錢 |
| 「WOFF2 對 CJK 只能壓 30–40%」 | glyf 來源實測**省 59%** | 壓縮率取決於**來源輪廓格式**，不是「CJK 就是壓不動」 |

⚠️ 最後一條有直接的金錢意義：**來源檔選錯白花 31%** —— 同樣是 400 字重壓成 woff2，走 `google/fonts` 的 `NotoSansTC[wght].ttf`（glyf）instance 到 400 是 **2.91 MB**，走 noto-cjk 的 `NotoSansTC-Regular.otf`（CFF）是 **4.19 MB**。

### 1. 主線：靜態 105 塊 unicode-range 切分，build 期自己切，手寫 `@font-face`

```
來源  google/fonts 的 NotoSansTC[wght].ttf
  → fonttools varLib.instancer wght=400          （7.15 MB 靜態 TTF，glyf）
  → 依 Google css2 端點的 105 段 unicode-range 切成 105 個 woff2
  → 產物 public/fonts/noto-sans-tc/*.woff2 ＋ generated 的 fonts.css（105 個 @font-face，font-display: swap）
  → <head> preload 最高頻數塊
```

**關鍵發現是「不需要新工具」**：Google Fonts 的 `css2` 端點已經把切法公開了 —— 105 個 `@font-face`、涵蓋 16,942 個碼位、依字頻排序。把那份 `unicode-range` 表抓下來存進 repo 當切分表，跑 105 次 `pyftsubset`，**8 執行緒 3.9 秒**跑完，總量 2.12 MiB，與 Google 官方的 2.14 MiB 差 1.2%（逐塊比對還略小 0.5–1%）。

因此**否決引入 `cn-font-split`**（不是它不好，是不需要）：切分表是我們 repo 裡的一份資料而非誰的黑箱，切分工具 `fonttools` 是 5.2k star、2026-08-31 剛發版的基礎設施。

**分塊數字（實測）**：單塊 1.1–44.6 KB、中位數 21.2 KB。分層覆蓋率 —— preload **5 塊 = 45 KB 覆蓋 55%**，**9 塊 = 185 KB 覆蓋 94%**，12 塊 = 303 KB 覆蓋 97.6%。

### 2. 否決動態 subset —— 對本專案是**反向優化**

動態 subset 的成立前提是「伺服器先知道用字」。編輯器恰恰相反：**使用者按下一個鍵，那個字此刻才存在**。代價是每份文件的 subset URL 都獨一無二 → **CDN 快取命中率趨近 0** → 每個使用者每份文件都是一次完整計算與傳輸，還多一輪往返延遲直接體現在打字上；另外任何人都能用亂數字元組合逼伺服器算 subset。

靜態分塊在同一個問題上表現好得多：打出沒載過的字，瀏覽器**自動**抓那一塊（中位數 21 KB），之後對這個使用者與任何打到同區字的使用者都是快取命中。

⚠️ 精準 subset 的誘惑要講清楚：同一批字精準切成單檔只要 **94 KB**，分塊要 739 KB —— **6–8 倍**。那 6–8 倍就是「用字無法預先窮舉」的**保險費**，不是浪費。付它是因為劇本是使用者產生內容。

### 3. `font-display: swap`

編輯器與行銷頁的決定性差異：**分塊載入不只發生在首屏，而是持續發生在打字過程中**（打出一個僻字名、一個罕見地名就會觸發）。於是：

- ❌ `optional` —— swap period 為 none，沒趕上就**永遠**用 fallback，同一頁「先打的是 Noto、後打的是蘋方」且**不會自我修復**。
- ❌ `block` —— block period 顯示 invisible fallback：**按了鍵螢幕上什麼都沒有**。寫作工具最不能忍的失敗模式。
- ⚠️ `fallback` —— 症狀同 `optional` 較輕。❌ `auto` —— 不可預測。
- ✅ **`swap`** —— 極短 block period ＋ 無限 swap period，塊一到就換上，**一定自我修復**。

配合 preload 高頻塊把「打字中換字型」的機率壓到個位數百分比。

### 4. 複核[票券 27](./27-ui-component-layer.md) 的 `ic` 耦合：**推論成立，欄寬不跳**

票券 27 第 4 點要求「29 決定 `font-display` 時複核」。實測 `hmtx`：

> **水 U+6C34 的 advance 在 Noto Sans TC 400 / PingFang TC Regular / Heiti TC Medium 全部是 1.0000 em。**

所以 `width: 40ic` 在整條 fallback 鏈上都等於 `40em`，**字型換手時欄寬不跳**，且 **`font-display` 選什麼都不影響** —— `ic` 的定義是「the font used to render it」，量到的當下無論是誰都是 1.0 em。

⚠️ **未量到微軟正黑體**（本機是 macOS，拿不到 `msjh.ttc`）—— 理論上全形字在中文字型裡都是全形，但這是**未驗證的推論**。列入下方實作期複核清單。

這也回頭印證了票券 27 那條刻意的論據選擇：`ic` 在當前字型組合下其實**是退化的**（等價於 `em`），它的價值不在數值而在**語意**與**對未來換字型的保險**。

### 5. 會跳的是行高，正解是無單位 `line-height` —— **不要碰 metric override**

實測換手時**中文字寬不跳**（全形都是 1.000 em）、**行高跳 3.43%**（`line-height: normal` 下 Noto 1.448 em vs 蘋方 1.400 em，一頁 40 行約一行半位移）、拉丁字寬小跳（數字 `0` 差 8.1%）、觀感差很多（蘋方 x-height 大 10.5%、cap height 大 17.3%）。

**兩個看似顯然的修法都是陷阱：**

1. ❌ **`ascent-override` / `descent-override` / `line-gap-override`：Safari 完全不支援**（MDN BCD 一手）。而**蘋方只出現在 Apple 平台** —— 要修的那個 fallback，正好在唯一不能修的平台上。
2. ❌ **`size-adjust` 會縮放 glyph advance**。為對齊 x-height 對蘋方下 `90.5%`，會讓 `1ic` 變成 0.905 em，**直接把第 4 點保住的欄寬弄跳**。一句話：**在 CJK 版面裡，`size-adjust` 修的是你不在乎的（x-height），弄壞的是你在乎的（`ic` 欄寬）。**

✅ **正解**：`line-height` 寫**無單位數值**（如 `1.85`，[票券 26](./26-ui-visual-direction.md) 的 `--leading-base` 已經是這個形狀），行盒高度與字型度量脫鉤，3.43% 的跳動歸零，且所有瀏覽器都成立。剩下的拉丁字寬與觀感差異**無法消除**，只能靠 preload 縮短暴露時間。

（`font-size-adjust: ic-width 1` 是唯一在 Safari 可用的度量對齊工具，Chrome 127／Firefox 92／Safari 17，**未實測**，列為岔路。）

### 6. 主線不用 `next/font/local`（但單檔後路可以用）

`localFont()` 的 `src` 陣列元素型別是 `{path, weight?, style?}`，**沒有 `unicodeRange`**；`declarations` 是**整個呼叫共用**的一組描述子，一次呼叫只能產一個 `unicode-range`。**105 塊無法用它表達** → 主線手寫 `@font-face`，放棄自動 preload 與 hash，換取對 `unicode-range` 的控制。

⚠️ 另一個地雷：`next/font/local` 的 `adjustFontFallback` 只有 `'Arial'` / `'Times New Roman'` / `false`，**預設是 `'Arial'`** —— 對 CJK 毫無意義，且它產的正是 Safari 無效的 metric override。**若哪天用到 `next/font/local`，必須顯式設 `false`。**

### 7. 台北黑體：官方沒有 webfont 管線，但這**不再是問題**

官方（翰字鑄造）只在 Google Sites 發 **Beta TTF**，無版本號、無 subset/webfont 管線、不在 Google Fonts（1,946 個 family 查無）。社群 `vp-tw/taipei-sans-tc` 已 **archived**、README 寫 no longer maintained；接替者 `@vp-tw/cjk-web-fonts-taipei-sans-tc` 是 2026-08-24 的 0.0.1、零 star。「是否隨上游思源黑體更新」**查不到任何一手證據**。

**但本票的 pipeline 對來源字型是無知的** —— 要試台北黑體，把來源 TTF 換掉重跑即可。第 5 節那個「沒有官方 webfont 管線」的缺點，**因為我們自己有管線而被抵銷**。這正是常設原則「一條路走通，但不堵死岔路」的又一次套用。

### 8. 這條路線**不對[票券 25](./25-deployment-and-hosting.md) 預先關門**

產物是純靜態 woff2。Vercel、Cloudflare Pages/Workers、任何 CDN、甚至 `next export` 都一樣跑。相對地，若當初選了動態 subset，Cloudflare Workers Free 方案（isolate 128 MB、CPU 10 ms）就直接出局 —— **這會是[票券 05](./05-pdf-export-tech.md) 之後第二條反向約束部署平台的技術路徑**。靜態路線避免了它。

### 保留的後路

| 後路 | 為什麼還開著 |
|---|---|
| 換成**單一精準 subset** | 若日後決定「編輯器只保證常用字」：3,031 碼位＝227 KB、5,146 碼位＝530 KB，CSS 從 105 個 `@font-face` 收成 1 個，改的是 build script 一個參數。此時 `next/font/local` 重新變成可用選項。 |
| 改**切分顆粒度** | 切分表是我們 repo 裡的資料。213 字/塊改成 100 字/塊只要換表重跑，4 秒。 |
| 換 `cn-font-split` / `vite-plugin-font` | 產物介面相同（woff2 ＋ unicode-range CSS）。若 Python 在 CI 變成負擔，替換 build step 即可，CSS 使用端不動。 |
| **加字重** | v1 只有 400（票券 26 定）。加 500/700 是同一條 pipeline 多跑兩次，成本線性（每字重約 2.1 MiB、4 秒）。 |
| **換字型**（含台北黑體） | 見第 7 點。 |
| 對**已知內容**做精準 subset | 分享頁、PDF 預覽頁這類伺服器端已知內容的路徑可另跑精準 subset（94 KB 級距），與編輯器的分塊策略**並存**。 |
| 接 **IFT** | W3C Incremental Font Transfer 已到 Candidate Recommendation Draft（2025-11-18），正是為 CJK 設計。Chrome 落地時程**查不到一手確認**，**不要排進 v1**；來源檔（instancer 產出的靜態 TTF）可直接餵給未來的 IFT 編碼器，切分表作廢但來源不變。 |

### 實作期複核清單（不擋開工，但別忘）

1. **用真實劇本語料重跑覆蓋率表** —— 上面 94%／185 KB 的數字是拿本專案的**技術散文 markdown** 當代理算的。劇本對白的字頻分布**應**更集中（口語常用字多、專有名詞少），所以同樣塊數的覆蓋率**應不低於**此表，但**未驗證**。有十份真實劇本就該重跑一次，據以決定 preload 幾塊。**這是本票最大的量測缺口。**
2. **在 Windows 上量微軟正黑體的 U+6C34 advance**（補完第 4 點），順便量它的 ascent/descent。
3. `font-size-adjust: ic-width 1` 在 Noto↔蘋方切換時的實際行為（Safari 上唯一可用的度量對齊工具，值得花十分鐘試）。
4. **首屏 bytes ≠ 首屏時間** —— 全文都是 bytes，沒有量 LCP/FCP。185 KB 在 4G 上的實際感受要在 prototype 上用真實裝置量。
5. Windows ClearType 下的渲染品質（前一輪就有的缺口，本次未補）。
