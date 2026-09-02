# 20 — 分享連結（即時 ＋ 凍結）

**What to build:** 分享是一次**具有獨立 identity 與生命週期的對外分享關係**（[ADR-0008](../../../docs/adr/0008-share-as-relationship-delivery-as-commitment.md)）—— 劇本是它的欄位，不是它的身分（凍結連結在劇本身分下沒有位置可站）。`share_links` 表：`id`、`screenplay_id`、`delivery_id`（**null ＝ 即時分享**）、`token`（**opaque 且不可枚舉**，nanoid 是實作選擇、不寫進規格）、`created_at`、`revoked_at`。**即時分享**（§10.1）：`/s/<token>`，免註冊可看，劇本與場次表是**同一個 share 的兩個視圖**（`/s/<token>` ＋ `/s/<token>/table`，頁內 segmented control 切換 —— URL 是 view 的定位，不是新的 share，兩個網址仍是同一條 token、同一個生命週期）；頁頂固定一行「即時連結 · 最後更新於 X」（讓漂移變得可察覺）；「內容是否變更」以 `doc_seq` 定義，timestamp 只是那個 canonical 事實的人類可讀投影。**凍結分享**（§10.2）：**不是分享面板上的第二個選項**，而是匯出 PDF 的副產品「取得這次交付的連結」；**快照必然**（不變式 D 強制，每次交付都建立），**連結自願**（token 懶惰鑄造 —— 否則「我只是想印一份 PDF」會在背後多出公開網址）；頁頂固定「這是 X 時交付的版本」；**不對凍結連結的讀者說「作者後來又改了」**（受眾是被刻意凍結的一方，洩漏 current state 是明確害處），但**在編劇自己的分享清單裡**顯示「這條連結凍結在 3 天前，之後 canonical state 已變更」（有用且零洩漏）。**撤銷**（§10.3）：寫 `revoked_at`、**保留該列**（刪掉就查不出這條連結曾存在），對訪客顯示**中性頁面**（不透露劇本是否存在、不透露是誰撤的、不引導去要新連結）；重新分享 ＝ 鑄新 token。**有效期：v1 不做。** 分享頁的場次導覽沿用同一種能力、依 delivery context 重建：**不顯示草稿**，高亮跟隨**閱讀位置**（分享頁沒有游標），搜尋／場次定位保留。`ShareViewer` 是**另一種 authorization subject 而非第二套機制**，**寫路徑不接受它**，具體型別在此決定。

**Blocked by:** 18, 06

**Status:** ready-for-agent

- [ ] `/s/<token>` 免註冊可看劇本與場次表，兩個 URL 同一條 token、同一生命週期
- [ ] 即時分享頁頂顯示「最後更新於 X」；變更判準是 `doc_seq`
- [ ] 凍結連結來自匯出 PDF 的副產品，token 懶惰鑄造（只印 PDF 不會多出公開網址）
- [ ] 凍結頁顯示「這是 X 時交付的版本」；不對讀者洩漏「作者又改了」
- [ ] 編劇自己的分享清單顯示凍結連結的 canonical 漂移
- [ ] 撤銷寫 `revoked_at`、保留列、訪客見中性頁
- [ ] 分享頁不顯示草稿；`ShareViewer` 無法進入寫路徑
- [ ] 有效期：v1 不實作
