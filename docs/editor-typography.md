# 編輯器 Typography 的定案值

規格 §7.11 / [`.scratch/scenephonie-mvp/research/ui-tokens-draft.md`](../.scratch/scenephonie-mvp/research/ui-tokens-draft.md)
把兩個字級／行高值標為 ⚠️ **prototype hypothesis**，要在原型實測後定案。票券 04 落地編輯器時
把它們收斂成 repo 的工作值，理由記在此。token 本體在
[`apps/web/src/styles/tokens.css`](../apps/web/src/styles/tokens.css)。

受**不變式 G**（[ADR-0010](./adr/0010-editor-representation-is-not-output-preview.md)）約束：
編輯器 typography **不繼承 PDF 模板的數字**（GHSA 直式橫書繁中 12 級字、TNUA 12pt／行距 16pt
≈ 1.33）。螢幕上的長時間寫作各自重新決定。

## `--text-base: 17px`

- **依據**：ui-tokens-draft.md §1.2 —— 「繁中在 16px 下筆畫密的字開始糊」。繁體字平均筆畫數遠高於
  拉丁字母，16px（一般西文 body 基準）在筆畫密處會糊成一團。17px 是「比西文 body 稍大一級」的
  最小可用值，避免直接跳到 18px 讓每行字數掉太多（行長是靠全形字數控的，見下）。
- **狀態**：工作值。真正的定案需要真人在多種螢幕密度上長時間閱讀校準 —— headless 環境測不了視覺
  疲勞。有 persistence（票券 05）與真實劇本語料後，這是第一個要回頭量的值。

## `--leading-base: 1.85`（無單位）

- **依據**：ui-tokens-draft.md §1.2 —— 漢字沒有 x-height 的視覺喘息，行距吃緊整段會糊。可探索
  區間 1.75–2.0，取中間偏鬆的 1.85（整體密度「偏鬆」，判準是八小時的疲勞度不是一屏塞多少）。
- **為什麼無單位**：research/cjk-webfont-loading.md §5 —— 字型換手時中文字寬不跳，但
  `line-height: normal` 下行高會跳 3.43%（Noto 1.448 em vs 蘋方 1.400 em）。寫成無單位數值讓
  行盒高度 = `1.85 × font-size`，與字型 ascent/descent 脫鉤，跳動歸零，且所有瀏覽器成立。
  兩個看似顯然的修法都是陷阱：`ascent-override` 家族 Safari 完全不支援（而蘋方只在 Apple 平台
  出現），`size-adjust` 會縮放 glyph advance 弄壞 `ic` 欄寬。
- **狀態**：工作值，同 `--text-base`。

## 相關的已定案值（不是 hypothesis）

| token | 值 | 出處 |
|---|---|---|
| `--font-body` | `"Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC",sans-serif` | §7.11，已定 —— 唯一可合法 self-host 的繁中黑體；蘋方受 Apple 嵌入限制、微軟正黑體立場不明，只能當 fallback |
| `--font-ui` | `system-ui` stack | §7.11，已定 —— 「介面像作業系統、內容像稿子」 |
| 字重 | 只載 Regular 400 | §7.11 / 約束 2 —— 粗體已從資料模型拿掉，字重不得表達內容語意 |
| 楷體／明體 | **不進螢幕編輯器** | §7.11 —— 螢幕長時間閱讀吃力，且違反不變式 G（屬 PDF 那一套）。fallback 鏈刻意不含 |
| 內容行長 | 30–40 全形字（`--measure-body-ic: 36`／對白 `26`） | §7.10 —— `ic` 表達需求語意、`em` 作 fallback（`34em` 再 `34ic`，靠級聯降級）；⚠️ 是閱讀基準不是統一欄寬 |

字型載入策略（靜態 105 塊 unicode-range subset、`font-display: swap`、preload 高頻塊）見
[`apps/web/scripts/fonts/README.md`](../apps/web/scripts/fonts/README.md)。
