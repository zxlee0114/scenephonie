# 05 — Persistence 模組

**What to build:** 存／載一份劇本，全部藏在單一模組後面（Yjs 保護規則 3）。`screenplays` 表：`doc jsonb`（不用 `text` —— 投的是除錯能力）、`doc_schema_version`（integer，隨程式碼走、部署時變）、`doc_seq`（bigint，每次成功改變 canonical document state 遞增，是 optimistic concurrency token —— 不是自動存檔次數、不是版次、不對使用者曝露）。lazy 遷移永遠在記憶體發生；寫回只在本來就會寫的路徑（使用者存檔、伺服器端 command），**讀取路徑一律不寫回**。原子性：schema migration + doc 更新 + `doc_seq` 遞增是同一個 atomic transition，沿用 `doc_seq` 並行檢查。自動備份（§6.7）：寫 before-image（被這次存檔覆蓋掉的那份 doc），無查閱 UI、v1 全部保留；觸發是伺服器端純時間判定，只看備份表 `MAX(created_at)`；硬保證「距上一筆備份 ≥ 2 小時就先寫一筆」（對外承諾：任何時候最多退回兩小時）；backup + canonical update 是同一個 atomic transition。呼叫端只知道「存」。debounce 用「停頓」（打字停 2–3 秒才存）+ 每 15 秒強制存一次上限。「整份 doc 覆蓋」假設不准散進各處。

**Blocked by:** 04, 01

**Status:** ready-for-agent

- [ ] 重整頁面，劇本內容還在
- [ ] 並行寫入：`doc_seq` 不符時第二個寫入被拒
- [ ] 舊 `doc_schema_version` 的 doc 載入時在記憶體遷移；PDF／場次表／分享等讀取路徑不觸發 DB 寫入
- [ ] `screenplay_backups` append-only、無 UI；距上次備份 ≥ 2h 的存檔會先寫一筆備份
- [ ] 備份與 canonical update 同一交易；migration + doc + `doc_seq` 同一交易
- [ ] persistence 之外的程式碼只看到「存／載」，看不到「備份」「doc_seq」概念
- [ ] debounce 是「停頓」＋ 15 秒上限；寫入放大靠調 debounce 不改資料模型
