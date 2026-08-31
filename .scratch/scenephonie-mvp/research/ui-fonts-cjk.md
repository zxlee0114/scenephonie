# 繁中螢幕字型調研

For: [票券 26](../issues/26-ui-visual-direction.md)

判準：**長時間（數小時）連續寫作的疲勞度**，不是好不好看。內文（`--font-body`）與介面（`--font-ui`）分開選型。PDF 輸出模板（標楷體等）不在本次範圍。

## 1. 候選比較表

| 字型 | 繁中螢幕閱讀品質 | 中英混排 | 授權 | Webfont 成本 | Fallback／OS 可用性 |
|---|---|---|---|---|---|
| **思源黑體 TC / Noto Sans TC**（Google Fonts 發行版，來源同 Source Han Sans TC） | 專為螢幕設計的 Pan-CJK 黑體，7 級字重（另有 9 級靜態切分＋variable font），字面較大、筆畫在小字級下清晰；macOS／Windows 上都能正常 hinting 渲染 | 內建拉丁字母（非原生西文字型的精緻度，但足以應付人名/術語混排），中西文對齊尚可 | **SIL Open Font License 1.1**，可自由 self-host、商用免費，不需授權費 [Font Squirrel](https://www.fontsquirrel.com/license/noto-sans) | 完整字集本身巨大（未裁切 CJK 常見報導為 10–16MB 級別），但 Google Fonts 是**逐字自動切成大量小塊 woff2**（每個 `@font-face` 只覆蓋一小段 unicode-range），瀏覽器只抓頁面實際用到的字塊 | 全平台無條件可 self-host；不依賴系統字即可統一觀感 |
| **Noto Sans CJK TC**（Google/Adobe 原始發布版，即 Source Han Sans TC） | 與 Noto Sans TC 同一套字稿（同一設計團隊、同源），差異主要在**打包方式**：CJK TC 是完整 Pan-CJK 或單語言 OTF/TTC，Google Fonts 版是切好 unicode-range 的 webfont 化版本 [notofonts/noto-cjk README](https://github.com/notofonts/noto-cjk/blob/main/Sans/README.md) | 同上 | 同 **SIL OFL 1.1**（Adobe 發布，Google 使用相同授權）[adobe-fonts/source-han-sans LICENSE](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt) | 未經 Google 的自動 unicode-range 切分，需自行用工具（如 fonttools subset）做 WOFF2 + subset，否則單一 TC 語言 OTF/TTC 檔案本身就是數 MB 到十幾 MB 級 | 同上；Android 5.0 起系統內建（但系統只內建 Regular 一個字重）[Grokipedia: Fonts on Android](https://grokipedia.com/page/Fonts_on_Android) |
| **蘋方 PingFang TC** | macOS/iOS 官方系統字，六個字重，視覺與 hinting 針對 Apple 螢幕最佳化，繁中閱讀評價高 | 拉丁字母品質佳（Apple 自家調校） | **不可 self-host 於 Web**：Apple 授權僅允許「執行 Apple 軟體期間顯示／列印」，網頁嵌入需另外取得字型內附的嵌入許可（fsType），實務上被視為違反授權 [bitinn.net 筆記](https://bitinn.net/11280/) | 不適用（無法合法作為 webfont 提供） | 只能當 **fallback**：macOS 10.11＋、iOS 9＋ 內建 [Grokipedia: PingFang typeface](https://grokipedia.com/page/PingFang_typeface) |
| **微軟正黑體 Microsoft JhengHei** | Windows Vista 以降內建，繁中預設字型，閱讀品質成熟但字面率略小於思源系 | 拉丁字母普通（非專為混排設計） | 版權屬 **Monotype**；僅授權在 Windows 平台內免費使用，是否可轉為 Web Font 嵌入網站**立場不明確**（微軟與 Monotype互踢皮球），業界建議避免未取得額外商業授權就 webfont 化 [toneoz.com 中文字型商用](https://toneoz.com/blog/usagefont/) | 不適用（授權不明，不建議 self-host） | 只能當 **fallback**：Windows Vista 起內建 [Wikipedia: Microsoft JhengHei](https://en.wikipedia.org/wiki/Microsoft_JhengHei) |
| **台北黑體 Taipei Sans TC**（翰字鑄造 JT Foundry，思源黑體改作） | 基於思源黑體修改字面與筆畫比例，設計目標即「螢幕/印刷皆宜」，台灣本地團隊維護 | 沿用思源黑體的拉丁字型 | **SIL OFL 1.1**（衍生自思源黑體同一授權），可商用、可 self-host [funtory.tw 介紹](https://funtory.tw/taipei-sans-tc/) | 未見官方 webfont 切分服務，需自行 subset；有社群 webfont package（`vp-tw/taipei-sans-tc`），但非官方維護，長期可靠度待查 | 需 self-host 或走社群套件，無 OS 內建可靠性 |
| **文鼎UD晶熙黑體**（iFontCloud / Arphic 商用字） | 專為 UI／小尺寸螢幕顯示設計（UD＝Universal Design 概念），大字面大字腔，適合橫向閱讀，並有 weight+width 雙軸 variable font | 提供多種拉丁字型搭配版本（HK／E1HK／AktivBHK／Ping 等） | **商用授權字型**，需向文鼎／iFontCloud 訂閱或購買 Web Font／租賃授權，非免費 [iFontCloud 產品頁](https://www.ifontcloud.com/index/newknowledge_detail_jxh.jsp?lang=zh&country=TW) | 供應商提供訂閱制 Web Font 服務（依訂閱條款動態載入，非自行 subset），實際傳輸量級查不到公開數字 | 不算系統 fallback，純商用授權字 |
| Noto Serif TC（僅供對照，不建議用於螢幕內文） | 明體，襯線在小字級螢幕上易有毛邊感，本次規格明確排除楷體/明體 | — | SIL OFL 1.1（同 Noto 家族） | 與 Noto Sans TC 量級相近 | 不建議採用，列此僅供對照 |

## 2. 逐項細節

### 2.1 授權（逐一列出出處）

- **Noto Sans TC / Noto Sans CJK TC（思源黑體同源）**：SIL Open Font License 1.1。允許自由使用、修改、redistribute、嵌入商業軟體與網站，唯不可將字型本身單獨販售。[Font Squirrel — License for font family 'Noto Sans'](https://www.fontsquirrel.com/license/noto-sans)；原始 Adobe 專案授權文字見 [adobe-fonts/source-han-sans LICENSE.txt](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt)。
- **PingFang TC**：Apple 系統字，授權僅限「執行 Apple 軟體期間顯示/列印」，未開放一般網頁嵌入；社群測試显示需竄改字型內的 fsType（embedding 旗標）才能嵌入，且此舉「很可能違反授權」。**不建議**作為 self-host webfont，只能倚賴其作為 macOS/iOS 系統 fallback。[bitinn.net 筆記](https://bitinn.net/11280/)
- **微軟正黑體**：版權屬 Monotype，微軟僅授權 Windows 平台內免費使用；轉製為 Web Font 嵌入網站「超出微軟賦予的基礎授權範圍」，且微軟與 Monotype 對此立場不明確。**不建議**未經額外商業授權就 self-host。[toneoz.com 中文字型如何合法商用](https://toneoz.com/blog/usagefont/)
- **台北黑體 Taipei Sans TC**：SIL OFL 1.1（衍生自思源黑體），免費、可商用、可 self-host。[funtory.tw](https://funtory.tw/taipei-sans-tc/)
- **文鼎UD晶熙黑體**：商用訂閱制字型（iFontCloud），非開源／非免費，需另行付費取得 Web Font 授權，本次調研查不到公開的價格與傳輸量級數字。[iFontCloud 產品說明](https://www.ifontcloud.com/index/newknowledge_detail_jxh.jsp?lang=zh&country=TW)

### 2.2 Webfont 體積

- 繁中字集龐大（常見字約 13,000–20,000+ 字），未裁切的完整 CJK 字型檔案業界公認落在 **10–16MB** 級距（單一語言 TC 子集通常仍有數 MB 到十餘 MB，視字重與是否含 variable 軸而定）。查到的具體業界估算：「完整中文字型約 15MB，subset 到常用 3,500 字可降到約 1.5MB，subset 到實際內容用字可降到 200–500KB」——此為第三方部落格估算數字，非官方測量，列出供參考但不宜直接引用為精確值。[symbolfyi.com CJK 優化指南](https://symbolfyi.com/guides/web-fonts-unicode-subsetting/)
- **WOFF2 壓縮率**：對拉丁字型可壓縮約 50%，但 CJK 因筆畫結構複雜、字形多樣，WOFF2 對 CJK 通常只能再壓縮約 **30–40%**（而非拉丁字型的 50%），這是 CJK webfont 化的主要成本瓶頸。[同上](https://symbolfyi.com/guides/web-fonts-unicode-subsetting/)
- **Google Fonts 的實作方式（重要）**：實測 `fonts.googleapis.com/css2?family=Noto+Sans+TC` 回傳的 CSS，單一字重（400）被切成**數十到上百個** `@font-face` 區塊，每個區塊只覆蓋一段 `unicode-range`（例如一個區塊只涵蓋幾十到幾百個字），瀏覽器只會下載頁面實際渲染到的那幾個小 chunk，而非整個字重的全字集檔案。這代表**若走 Google Fonts CDN**，實際傳輸量取決於頁面出現的字元種類，一般中文編輯器頁面（幾百到一千餘常用字＋標點＋拉丁字母）實務上多半落在**數十 KB 到數百 KB**級距，遠低於完整字型檔案的量級。（此為本次直接對 Google Fonts CSS API 的實測結果，非估算）
- 若**自行 self-host**（不走 Google Fonts CDN），需要自行用 `fonttools subset` 或 `pyftsubset` 依實際用字（劇本場景描述、對白常用字＋拉丁 A-Z/0-9＋標點）做動態或預先 subset，並輸出 WOFF2，才能達到類似的傳輸量級；否則整包字重檔案會回到 MB 級。

### 2.3 各 OS 內建繁中字型 fallback

- **macOS 10.11 El Capitan 以降／iOS 9 以降**：內建 PingFang TC（六個字重，含 TC/SC/HK 三個地區版本）。[Grokipedia: PingFang typeface](https://grokipedia.com/page/PingFang_typeface)
- **Windows Vista 以降**：內建微軟正黑體 Microsoft JhengHei，為系統預設繁中字型。[Wikipedia: Microsoft JhengHei](https://en.wikipedia.org/wiki/Microsoft_JhengHei)
- **Android 5.0 以降**：內建 Noto Sans CJK（思源黑體同源），但系統只內建 **Regular 一個字重**，其餘字重不隨系統附帶。[Grokipedia: Fonts on Android](https://grokipedia.com/page/Fonts_on_Android)
- **主流 Linux 發行版**：Fedora 已將 CJK 預設字型改為 Google Noto（`fonts-noto-cjk` 套件），可透過 fontconfig（如 `/etc/fonts/local.conf` 或 `70-fonts-noto-cjk.conf`）指定 Noto Sans CJK TC 為 sans-serif 首選；但並非所有發行版都預裝，未裝的系統會落到更粗糙的 fallback 或缺字方塊（tofu）。[Fedora Wiki: CJKDefaultFontsToNoto](https://fedoraproject.org/wiki/Changes/CJKDefaultFontsToNoto)、[notofonts/noto-cjk](https://github.com/notofonts/noto-cjk)

**純系統字（不載 webfont）時的風險**：四個平台會呈現四種不同字面（蘋方 vs 正黑體 vs Android 內建 Noto Regular vs Linux 視發行版而定），字重、字面率、筆畫粗細都不同，長時間编辑器閱讀體驗會因使用者的 OS 而**不一致**；且 Android／部分 Linux 只保證 Regular 字重，若介面設計依賴 Medium/Semibold 做層級區分，會在這些平台上被瀏覽器「假粗體」（synthetic bold）取代，觀感與 hinting 品質都會下降。

## 3. 建議

### `--font-body`（劇本內文、對白、動作）

建議：**Noto Sans TC（思源黑體）**，self-host，經 subset 後以 WOFF2 供應。

理由：
- 唯一同時滿足「繁中螢幕閱讀品質好、授權可自由 self-host、跨平台 hinting 品質穩定」三個條件的候選。PingFang TC 閱讀品質雖佳但無法合法 webfont 化；微軟正黑體授權不明確；文鼎晶熙黑體品質更適合 UI 但是商用付費、且本次未查到公開的傳輸量級數字，风险未知。
- 台北黑體是可行的次選（同源、同授權、本地化調整），但缺乏官方維護的 webfont 切分管線，長期可靠度不如直接用 Google Fonts／Noto 官方發布版。若未來想要更貼近台灣排版慣例的字面調整，可以把它列為候選 A/B 測試對象，但不建議作為 v1 首選。

### `--font-ui`（側欄、按鈕、選單、場次表）

建議：**同樣以 Noto Sans TC 為主**，但字重收斂在 Regular/Medium/Semibold 三級，不使用內文的完整字重階梯；若日後需要更緊湊的 UI 字面（大字腔、UD 設計），文鼎UD晶熙黑體是唯一查到的「專為螢幕 UI 設計」候選，但需先確認訂閱制授權費用與是否可 self-host（本次查不到），列為觀察項而非 v1 建議。

不建議內文與 UI 使用完全不同的字型家族（如內文思源黑、UI 用系統 PingFang/正黑體）：那會讓兩者的字重階梯、字面率不對齊，且 PingFang／正黑體都不能合法 self-host，會導致「Mac 使用者看到的 UI 字型」與「Windows 使用者看到的 UI 字型」不一致，違背「一眼分辨哪些字是我寫的」這個設計意圖背後所需要的**視覺一致性**。用同一字型家族、不同字重/字級來做內文與 UI 的區隔，才是可控的做法。

### Fallback 鏈建議

```css
--font-body: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif;
--font-ui:   "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif;
```

- 第一順位一律是 self-host 的 Noto Sans TC，確保 webfont 載入成功時全平台一致。
- PingFang TC／微軟正黑體僅作為 **webfont 尚未載入完成前**或**極端情況下 webfont 載入失敗**的系統字 fallback，不作為主力供應字型（授權也不允許）。
- 中英混排未額外指定西文 fallback（如 `-apple-system`/`Segoe UI` 開頭）：Noto Sans TC 內建的拉丁字母已可涵蓋人物名、`INT.`／`V.O.` 等術語的日常需求；若未來實測發現西文字重/字寬觀感不夠精緻，可以在 `--font-body`／`--font-ui` 前面插入一個純西文字型（如 self-host 的 Inter 或系統 `-apple-system`）做「先西文後中文」的雙字型疊放，但這需要另外驗證中西文基線對齊，此次調研未實測，留待 prototype 階段驗證。

### 兩條路線的代價

| 路線 | 代價 |
|---|---|
| **載 webfont**（self-host Noto Sans TC，subset + WOFF2） | 需要建置 subset pipeline（依實際用字動態或建置期切分），初次載入有網路成本（依 subset 策略，數十 KB 到數百 KB 級距，需自行實測），但換來跨平台觀感一致、字重階梯完整可控 |
| **純系統字**（完全不載 webfont，只用 fallback 鏈） | 零額外傳輸成本、零 subset 工程，但代價是 macOS/Windows/Android/Linux 四種截然不同的字面與字重可用性（尤其 Android／部分 Linux 只有 Regular 一個字重），長時間編輑器體驗會因使用者的作業系統而不一致，且無法保證 hinting／渲染品質下限 |

## 4. 不確定與缺口

- **Noto Sans TC self-host 後實際 subset 大小的精確數字**：本次只查到第三方部落格對「CJK 字型 subset 後量級」的估算（未附測量方法），以及對 Google Fonts CDN 分塊策略的一手觀察（本次實測），但**沒有查到 Scenephonie 實際用字表 subset 後的具體 KB 數字**——這需要拿到實際場次腳本文本語料後才能算出。
- **文鼎UD晶熙黑體的訂閱制 Web Font 實際費用與傳輸量級**：官方頁面只說明有訂閱制服務，查不到公開價目表或技術規格（是否走 CDN 動態載入、是否可 self-host、實際 woff2 大小），需要直接聯繫 iFontCloud／文鼎才能確認。
- **中英文基線對齊與字級搭配的實測**：本次只查到「Noto Sans TC 內建拉丁字母，品質可用但非專門西文字型」的定性描述，沒有查到具體的 x-height／baseline 數據比較（例如 Noto Sans TC 內建拉丁 vs Inter/SF Pro 的字級落差），這類細節需要實際排版截圖比對，屬於 prototype 階段的工作，不在本次文獻調研範圍內。
- **台北黑體的官方 webfont 供應狀態**：只查到社群維護的 `vp-tw/taipei-sans-tc` webfont package，未查到翰字鑄造官方是否有維護對應的 subset/webfont 發布管線，其長期可靠度（是否會隨上游思源黑體更新）查不到。
- **Windows 上 hinting 差異的具體測試數據**：本次沒有找到針對 Noto Sans TC 在 Windows ClearType 與 macOS 之間渲染差異的一手評測或截圖比對，只有「hinting 品質良好」這類定性說法，此項缺口需要實機截圖驗證。
