# 05 — Persistence 模組

**What to build:** 存／載一份劇本，全部藏在單一模組後面（Yjs 保護規則 3）。`screenplays` 表：`doc jsonb`（不用 `text` —— 投的是除錯能力）、`doc_schema_version`（integer，隨程式碼走、部署時變）、`doc_seq`（bigint，每次成功改變 canonical document state 遞增，是 optimistic concurrency token —— 不是自動存檔次數、不是版次、不對使用者曝露）。lazy 遷移永遠在記憶體發生；寫回只在本來就會寫的路徑（使用者存檔、伺服器端 command），**讀取路徑一律不寫回**。原子性：schema migration + doc 更新 + `doc_seq` 遞增是同一個 atomic transition，沿用 `doc_seq` 並行檢查。自動備份（§6.7）：寫 before-image（被這次存檔覆蓋掉的那份 doc），無查閱 UI、v1 全部保留；觸發是伺服器端純時間判定，只看備份表 `MAX(created_at)`；硬保證「距上一筆備份 ≥ 2 小時就先寫一筆」（對外承諾：任何時候最多退回兩小時）；backup + canonical update 是同一個 atomic transition。呼叫端只知道「存」。debounce 用「停頓」（打字停 2–3 秒才存）+ 每 15 秒強制存一次上限。「整份 doc 覆蓋」假設不准散進各處。

**Blocked by:** 04, 01

**Status:** in-review

- [x] 重整頁面，劇本內容還在
- [x] 並行寫入：`doc_seq` 不符時第二個寫入被拒
- [x] 舊 `doc_schema_version` 的 doc 載入時在記憶體遷移；PDF／場次表／分享等讀取路徑不觸發 DB 寫入
- [x] `screenplay_backups` append-only、無 UI；距上次備份 ≥ 2h 的存檔會先寫一筆備份
- [x] 備份與 canonical update 同一交易；migration + doc + `doc_seq` 同一交易
- [x] persistence 之外的程式碼只看到「存／載」，看不到「備份」「doc_seq」概念
- [x] debounce 是「停頓」＋ 15 秒上限；寫入放大靠調 debounce 不改資料模型

## Comments

**2026-09-04 — 實作收票（code review 後）。** 三處與規格文字不同、刻意為之的地方，記在這裡免得日後被當成 bug「修」掉：

1. **`screenplay_backups` 多一欄 `doc_schema_version`**（§6.2 那張表只列 `id`／`screenplay_id`／`doc`／`created_at`）。before-image 存的是**當時儲存的那一份 doc**，其 schema 版本可能低於現行版本；少了這一欄，撈回來的 doc 不知道該從遷移鏈的哪一節接上，備份就失去 recovery 的價值。
2. **不實作 §6.7 那條實作層 heuristic**（「距上次成功存檔 ≥ 30 分鐘視為新的一次坐下」）。票券把觸發收斂成「只看備份表 `MAX(created_at)`」的單一判準；那條 heuristic 只會讓備份變多、絕不會變少，所以硬保證不受影響，而少一個輸入就少一種要解釋的行為。要加隨時可加。
3. **多了一行存檔狀態文字**（「儲存中…」／「已儲存」／衝突提示）。票券沒要求，但並行衝突若不出聲，使用者會在一份再也存不進去的分頁裡繼續打字 —— 那正好打穿驗收框第一條。它是 `position: fixed` 貼在 header bar 上的暫時作法，票券 06 把 header 換成真元件時應該搬進去。

**已知缺口，屬票券 06：** `saveScreenplayAction` 目前沒有授權 gate，任何 client 都能對任意 `screenplayId` 覆寫整份 doc（`actions.ts` 檔頭已標記）。在票券 06 補上 gate 之前不得對外開放。

**append-only 是程式碼層規則，不是資料庫權限層保證** —— `screenplay_backups` 的 FK 是 `ON DELETE cascade`。要變成保證，得撤掉執行期角色的 `UPDATE`／`DELETE` 權限，那要等票券 06 有真正的角色分離。
