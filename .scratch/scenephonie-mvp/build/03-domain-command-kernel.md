# 03 — Domain command 層 kernel 與不變式測試框架

**What to build:** 寫入邊界。`command(doc) → 新 doc` 的純函式模式（isomorphic TS，Node 可跑）。command 是程式碼不是資料 —— 否決「可序列化訊息、可寫 log、可重播」（那會走進 event sourcing；要的東西 ProseMirror 的 `Step` 已經給了）。建立**准入判準**（一個 command 要進來，至少滿足其一：強制執行一條不變式，或以 `sceneId`／實體 id 定址而非以位置定址）與 **edge-boundary 規則**（UI／application 不得依賴編輯器實作細節，跨邊界只透過 command 與 projection）。實作 `appendTransaction` 去重（不變式 ⑥：同一份 doc 內 id 不重複；只在偵測到重複時動作，改本次新插入的節點；標 `addToHistory: false`）。身分鑄造（不變式 ⑦：只在五個時刻鑄造，其餘一切保住 id）就現有節點型別成立。初始 commands：`createNextScene`、`setBlockType(blockId, type)`、`moveScene(sceneId, target)`（自身也要拒絕非法目標）。§11 不變式總表在此有一個瀏覽器外可單元測試的家。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] command 是純函式、吃 doc 吐 doc、Node 可測；沒有可序列化訊息 log
- [ ] 去重：複製貼上觸發換新 id、剪下貼上保住 id；碰撞本身是唯一判別器
- [ ] 去重 transaction 標 `addToHistory: false`（⌘Z 不會退回重複 id 的狀態）
- [ ] `moveScene` 對非法目標回傳拒絕，不靠 UI 擋（縱深：UI 擋滑鼠，command 擋伺服器端呼叫與日後 API）
- [ ] 准入判準寫成可檢查的規則；不滿足的操作留在編輯器當一般 Tiptap command
- [ ] 不變式測試檔按 §11 編號組織，新不變式有明確落點
- [ ] command 層可在 Node 跑（`EditorState`／schema／transaction 不需 `EditorView`）
