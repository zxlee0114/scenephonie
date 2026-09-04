# CJK 字型管線（票券 29）

`--font-body` = self-host **Noto Sans TC Regular 400**，靜態 **105 塊 unicode-range subset**。
決策與實測見 [`.scratch/scenephonie-mvp/research/cjk-webfont-loading.md`](../../../../.scratch/scenephonie-mvp/research/cjk-webfont-loading.md)
與規格 §7.11。**否決動態 subset**（編輯器用字無法預先窮舉）。

## 產物（已提交進版控）

| 路徑 | 內容 |
|---|---|
| `apps/web/public/fonts/noto-sans-tc/001.woff2 … 105.woff2` | 105 塊 subset，合計約 2.2 MiB |
| `apps/web/public/fonts/noto-sans-tc/fonts.css` | GENERATED：105 個 `@font-face`、`font-display: swap` |
| `apps/web/scripts/fonts/unicode-ranges.json` | 從 Google `css2` 抓下的 105 段切分表（依字頻）＋ 每塊 bytes ＋ `preloadOrdinals` |

`fonts.css` 由 `src/app/layout.tsx` 匯入；同檔依 `unicode-ranges.json` 的 `preloadOrdinals`
在 `<head>` 產生高頻塊的 `<link rel="preload">`（研究：約 9 塊 ≈ 覆蓋九成字元）。

## 重跑

```bash
cd apps/web/scripts/fonts
python3 -m venv .venv
.venv/bin/pip install "fonttools[woff]" brotli
PATH=".venv/bin:$PATH" .venv/bin/python build-noto-subset.py          # 需要網路：抓 VF + css2
PATH=".venv/bin:$PATH" .venv/bin/python build-noto-subset.py --no-fetch  # 沿用既有 VF 與 repo 內切分表
```

管線：`google/fonts` 的 `NotoSansTC[wght].ttf` → `fonttools varLib.instancer wght=400`（glyf
靜態 TTF，比 CFF OTF 省約 31%）→ 依切分表跑 105 次 `pyftsubset --flavor=woff2`。8 執行緒約 4 秒。
`.venv/` 不進版控。

## 設計備註

- **`font-display: swap`** 是唯一值：分塊載入持續發生在打字過程中，`block` ＝ 按鍵後空白、
  `optional`／`fallback` ＝ 同頁字型永久混排且不自我修復（研究 §4.2）。
- **行高寫無單位** `line-height`（`--leading-base`）—— 字型換手時中文字寬不跳、行高會跳 3.4%；
  `ascent-override` 家族 Safari 不支援、`size-adjust` 會弄壞 `ic` 欄寬，兩個顯然的修法都是陷阱。
- **只載 400**：約束 2 已把粗體從資料模型拿掉，字重不得表達內容語意。
- **fallback 鏈**：`"PingFang TC","Microsoft JhengHei","Heiti TC",sans-serif`。楷體／明體不進螢幕編輯器。

## 已知量測缺口（研究 §7 / 實作期複核清單）

1. **覆蓋率表是用技術散文 markdown 當代理算的，未用真實劇本語料重跑。** 劇本對白字頻應更集中，
   同塊數覆蓋率應不低於此，但未驗證。有十份真實劇本就重跑一次，據以調整 `PRELOAD_TOP_CJK`。
2. 微軟正黑體的 U+6C34 advance 未在 Windows 實測（`ic` 欄寬保險的推論仍有一個未量到的角）。
3. 首屏 bytes ≠ 首屏時間 —— 未量 LCP/FCP，未在真實 4G 裝置上感受。
4. Windows ClearType 下的渲染品質未驗證。
