# 20 — 分享連結（即時 ＋ 凍結）

**What to build:** 分享是一次**具有獨立 identity 與生命週期的對外分享關係**（[ADR-0008](../../../docs/adr/0008-share-as-relationship-delivery-as-commitment.md)）—— 劇本是它的欄位，不是它的身分（凍結連結在劇本身分下沒有位置可站）。`share_links` 表：`id`、`screenplay_id`、`delivery_id`（**null ＝ 即時分享**）、`token`（**opaque 且不可枚舉**，nanoid 是實作選擇、不寫進規格）、`created_at`、`revoked_at`。**即時分享**（§10.1）：`/s/<token>`，免註冊可看，劇本與場次表是**同一個 share 的兩個視圖**（`/s/<token>` ＋ `/s/<token>/table`，頁內 segmented control 切換 —— URL 是 view 的定位，不是新的 share，兩個網址仍是同一條 token、同一個生命週期）；頁頂固定一行「即時連結 · 最後更新於 X」（讓漂移變得可察覺）；「內容是否變更」以 `doc_seq` 定義，timestamp 只是那個 canonical 事實的人類可讀投影。**凍結分享**（§10.2）：**不是分享面板上的第二個選項**，而是匯出 PDF 的副產品「取得這次交付的連結」；**快照必然**（不變式 D 強制，每次交付都建立），**連結自願**（token 懶惰鑄造 —— 否則「我只是想印一份 PDF」會在背後多出公開網址）；頁頂固定「這是 X 時交付的版本」；**不對凍結連結的讀者說「作者後來又改了」**（受眾是被刻意凍結的一方，洩漏 current state 是明確害處），但**在編劇自己的分享清單裡**顯示「這條連結凍結在 3 天前，之後 canonical state 已變更」（有用且零洩漏）。**撤銷**（§10.3）：寫 `revoked_at`、**保留該列**（刪掉就查不出這條連結曾存在），對訪客顯示**中性頁面**（不透露劇本是否存在、不透露是誰撤的、不引導去要新連結）；重新分享 ＝ 鑄新 token。**有效期：v1 不做。** 分享頁的場次導覽沿用同一種能力、依 delivery context 重建：**不顯示草稿**，高亮跟隨**閱讀位置**（分享頁沒有游標），搜尋／場次定位保留。`ShareViewer` 是**另一種 authorization subject 而非第二套機制**，**寫路徑不接受它**，具體型別在此決定。

**Blocked by:** 18, 06

**Status:** in-review

- [x] `/s/<token>` 免註冊可看劇本與場次表，兩個 URL 同一條 token、同一生命週期
- [x] 即時分享頁頂顯示「最後更新於 X」；變更判準是 `doc_seq`（加上交付印得出名字的實體改名，見 Comments）
- [x] 凍結連結來自匯出 PDF 的副產品，token 懶惰鑄造（只印 PDF 不會多出公開網址）
- [x] 凍結頁顯示「這是 X 時交付的版本」；不對讀者洩漏「作者又改了」
- [x] 編劇自己的分享清單顯示凍結連結的 canonical 漂移
- [x] 撤銷寫 `revoked_at`、保留列、訪客見中性頁
- [x] 分享頁不顯示草稿；`ShareViewer` 無法進入寫路徑
- [x] 有效期：v1 不實作

## Comments

**2026-10-23 實作筆記**

- **漂移判準（使用者裁決）**：`deliveries` 加 `source_doc_seq`，建立交付時在同一個 repeatable-read 交易裡拍下。它是來源記錄、只寫一次，不是並行 token，也不是遷移鏈的一節 —— §10.4 與 `delivery-boundary.test.ts` 已同步改寫。既有的交付補 0（寧可多說一句「之後改過」）。`doc_seq` 仍不出 persistence：外面只拿得到 `deliveriesChangedSince()` 回的「哪幾筆」。
- **`ShareViewer` 的具體型別**：與兩種 handle 同一個 `unique symbol` brand，值是 `"share"`，所以結構上塞不進任何要 `AuthorizedScreenplay` 的地方。`share-gate.integration.test.ts` 用 `@ts-expect-error` 釘住存檔、建立交付、鑄連結、撤銷都不收它。唯一收它的是 `loadSharedScript`。
- **即時分享讀的是交付投影**（`projectDelivery`，當場推導、不寫回），所以「不顯示草稿」與 PDF 是同一個答案；分享頁只有一套畫法。
- **get-or-mint**：兩條 partial unique index（每筆交付／每份劇本的即時分享，同時只有一條未撤銷的）讓並行的兩次點擊不會多鑄一條公開網址。
- **撤銷與不存在的 token** 回同一個中性頁「這條連結已停用。」。
- 分享面板的「停用」要按兩次（確認）；撤銷後重新建立的是新 token。
- **改實體名算變更（使用者裁決，2026-10-23）**：審查時發現改人物／地點名不推進 `doc_seq`，即時頁「最後更新於」不動、凍結清單也不標漂移。裁決：算。實作只算交付印得出名字的實體（`deliveredEntityIds`，正式場次的地點與出場人物；說話者印的是顯示名，不算）：即時頁的「最後更新於」＝ max(劇本存檔時間, 這些實體的 `updated_at`)；漂移 ＝ `source_doc_seq` 落後**或**投影與交付 payload 結構不相等（doc 相同時只可能差在實體名）。比 payload 而不比時間戳，避開 DB `now()` 與應用伺服器時鐘的差。改回原名 → 投影相同 → 不算漂移；但「最後更新於」仍會前進（它只看改名時間）。日後若改了 payload 版本，舊交付會一律被標漂移（保守）。
