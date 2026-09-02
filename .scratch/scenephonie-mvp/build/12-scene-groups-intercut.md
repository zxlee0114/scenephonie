# 12 — 場次群組（對剪）

**What to build:** 平行，存在的理由只有一個：保住交錯（[ADR-0004](../../../docs/adr/0004-scene-groups-for-intercut.md)、規格 §5.2 的裁決）。三種 node：`sceneGroup`（attr `groupId`，`gr_` 前綴 nanoid，使用者永遠看不到）／`groupMember`（同 `scene` 全部 metadata attrs 含 `sceneId`，無內容，atom）／`groupFragment`（attr `memberId` 指向同群組某個 `groupMember` 的 `sceneId`，內容 `(sceneBlock｜subscene)+`）。文件頂層放寬為 `(scene | sceneGroup)+`。不變式 ③（同群組成員間 metadata 不得完全相同 → 自動草稿）、④（群組不能巢狀、一個場次不能同時屬於兩個群組 —— 由樹結構免費保證）。成員各佔一個**頂層場次號**（`26`／`27`／`28`）、場次表各一列；**群組本身不佔號、不進場次表**。`projectScenes()` 對 `groupMember` 與 `scene` 一視同仁。手勢：`/` →「對剪到…」建立群組（第二步沿用「選既有場次或建立新的一場」）；`⌘+1`／`⌘+2`／`⌘+3` 切換游標所在片段的歸屬，**直接定址**，超出成員數是**無效鍵**（`⌘+4` 在三成員時永遠不會憑空建立場次）。command `assignFragmentToMember(groupId, fragmentIndex, memberId)` —— `fragmentIndex` 是呼叫當下由編輯器從游標算出的傳遞參數，**不被任何東西儲存**（保護規則 2／3）。片段正規化：相鄰兩片段歸屬同一成員時 `appendTransaction` 合併（標 `addToHistory: false`）。**片段在 v1 不給 id、不給任何東西引用**。`groupId` 去重與 `sceneId` 走同一套。成員可以有自己的子場次（群組不能巢狀，但階層裝得進平行）。「以下對剪」不進資料模型。

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] `/` →「對剪到…」建立群組；成員各得一個頂層場次號
- [ ] schema 保證群組不能巢狀、一個場次不屬於兩個群組
- [ ] 同群組成員 metadata 完全相同時自動是草稿（不變式 ③）
- [ ] `⌘+1/2/3` 直接定址切換片段歸屬；`⌘+4` 在三成員時是無效鍵，不建立場次
- [ ] `assignFragmentToMember` 以 id 定址，`fragmentIndex` 不被持久化
- [ ] 相鄰同成員片段自動合併，標 `addToHistory: false`
- [ ] 片段沒有 id，沒有任何持久化引用指向片段
- [ ] `groupId` 走與 `sceneId` 相同的去重規則；群組成員可有自己的子場次
