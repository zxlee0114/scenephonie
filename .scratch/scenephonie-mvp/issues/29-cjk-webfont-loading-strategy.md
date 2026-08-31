# Noto Sans TC 的 subset 與載入策略

Type: research
Status: open
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
