# 12 — 場次群組（對剪）

**What to build:** 平行，存在的理由只有一個：保住交錯（[ADR-0004](../../../docs/adr/0004-scene-groups-for-intercut.md)、規格 §5.2 的裁決）。三種 node：`sceneGroup`（attr `groupId`，`gr_` 前綴 nanoid，使用者永遠看不到）／`groupMember`（同 `scene` 全部 metadata attrs 含 `sceneId`，無內容，atom）／`groupFragment`（attr `memberId` 指向同群組某個 `groupMember` 的 `sceneId`，內容 `(sceneBlock｜subscene)+`）。文件頂層放寬為 `(scene | sceneGroup)+`。不變式 ③（同群組成員間 metadata 不得完全相同 → 自動草稿）、④（群組不能巢狀、一個場次不能同時屬於兩個群組 —— 由樹結構免費保證）。成員各佔一個**頂層場次號**（`26`／`27`／`28`）、場次表各一列；**群組本身不佔號、不進場次表**。`projectScenes()` 對 `groupMember` 與 `scene` 一視同仁。手勢：`/` →「對剪到…」建立群組（第二步沿用「選既有場次或建立新的一場」）；`⌘+1`／`⌘+2`／`⌘+3` 切換游標所在片段的歸屬，**直接定址**，超出成員數是**無效鍵**（`⌘+4` 在三成員時永遠不會憑空建立場次）。command `assignFragmentToMember(groupId, fragmentIndex, memberId)` —— `fragmentIndex` 是呼叫當下由編輯器從游標算出的傳遞參數，**不被任何東西儲存**（保護規則 2／3）。片段正規化：相鄰兩片段歸屬同一成員時 `appendTransaction` 合併（標 `addToHistory: false`）。**片段在 v1 不給 id、不給任何東西引用**。`groupId` 去重與 `sceneId` 走同一套。成員可以有自己的子場次（群組不能巢狀，但階層裝得進平行）。「以下對剪」不進資料模型。

**Blocked by:** 11

**Status:** in-review

- [x] `/` →「對剪到…」建立群組；成員各得一個頂層場次號
- [x] schema 保證群組不能巢狀、一個場次不屬於兩個群組
- [x] 同群組成員 metadata 完全相同時自動是草稿（不變式 ③）—— 判準 `echoingMembers` 已在 kernel，**接進草稿推導是票券 14**（同票 11 的 ②）
- [x] `⌘+1/2/3` 直接定址切換片段歸屬；`⌘+4` 在三成員時是無效鍵，不建立場次
- [x] `assignFragmentToMember` 以 id 定址，`fragmentIndex` 不被持久化
- [x] 相鄰同成員片段自動合併，標 `addToHistory: false`
- [x] 片段沒有 id，沒有任何持久化引用指向片段
- [x] `groupId` 走與 `sceneId` 相同的去重規則；群組成員可有自己的子場次

## Comments

**2026-10-20 實作（agent）**：kernel（三個節點、`intercutTo`／`assignFragmentToMember`／`normalizeFragmentsPlugin`、`findContainer` 定址、`groupId` 去重、`echoingMembers`、`projectScenes` 成員編號）＋編輯器（`/intercut` 兩步、`FragmentKeys`、成員共用 `SceneView`、片段原生 node view、「以下對剪」decoration）。待瀏覽器驗收。

使用者裁決：

1. 第二步「選既有場次」＝**收編**：那一場保住 `sceneId` 與 metadata、原本的內容變成它的片段（不鑄造；只有「建立新的一場」是 `createGroupMember`）。
2. `⌘+N` **從游標這一行切開**：游標區塊（含其後）歸給成員 N；第一行＝整段改歸屬、末尾空行＝開新片段。command 多一個傳遞參數 `fromBlockIndex`。

實作時自己做的判斷：

3. schema 寫 `groupMember* groupFragment*`（§5.1 意圖 `+`）—— 兩者都帶無 default 的 id，放在必填位置 schema 建不起來，與 `doc` 同一顆雷。「至少兩個成員、一個片段」由 command 守。
4. 片段裡的區塊以 **成員 `sceneId` ＋ `fragmentIndex`（群組裡第幾個片段）＋ 區塊序** 定址（kernel `ContainerAddress`）。`setBlockType`／`setDialogueCharacters`／`createSubscene` 因此在片段裡照常可用。
5. 在群組裡按「對剪到…」＝**加入一個成員**，新片段接在游標所在片段之後 —— 三地對剪的第三個成員只能從這個入口來（⌘+4 不建立場次）。
6. 刪成員連帶它的片段；**只剩一個成員時群組解散**，那個成員變回普通場次（保住 id 與 metadata、片段依序接起來）；剩下的成員都沒有片段時補一段空的。⚠️ 這是新的產品決定，ADR／spec 沒有寫，需要確認。
7. 正規化多做一件事：**孤兒片段**（`memberId` 不是本群組成員，例如單一片段貼進別的群組）歸給前一段的成員（第一段歸第一個成員），再照常合併。
8. 游標在**成員的子場次**裡按 `⌘+N` 是無效鍵 —— 片段不能從子場次切開（同不變式 ①）。
9. 片段的常駐標籤：號碼住 gutter、地點是片段開頭一行小字（地點未填就印「地點未填」）。**票券 15 的「點標籤修正歸屬」沒有做** —— `⌘+N` 在第一行就是整段改歸屬，同一件事已有鍵盤路徑。
10. 群組的「＋ 新增下一場」在群組腳部，接在整個群組之後。成員 chip row 前印 `⌘1`／`⌘2`… 作為鍵的提示。
