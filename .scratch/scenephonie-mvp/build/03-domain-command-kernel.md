# 03 — Domain command 層 kernel 與不變式測試框架

**What to build:** 寫入邊界。`command(doc) → 新 doc` 的純函式模式（isomorphic TS，Node 可跑）。command 是程式碼不是資料 —— 否決「可序列化訊息、可寫 log、可重播」（那會走進 event sourcing；要的東西 ProseMirror 的 `Step` 已經給了）。建立**准入判準**（一個 command 要進來，至少滿足其一：強制執行一條不變式，或以 `sceneId`／實體 id 定址而非以位置定址）與 **edge-boundary 規則**（UI／application 不得依賴編輯器實作細節，跨邊界只透過 command 與 projection）。實作 `appendTransaction` 去重（不變式 ⑥：同一份 doc 內 id 不重複；只在偵測到重複時動作，改本次新插入的節點；標 `addToHistory: false`）。身分鑄造（不變式 ⑦：只在五個時刻鑄造，其餘一切保住 id）就現有節點型別成立。初始 commands：`createNextScene`、`setBlockType(blockId, type)`、`moveScene(sceneId, target)`（自身也要拒絕非法目標）。§11 不變式總表在此有一個瀏覽器外可單元測試的家。

**Blocked by:** 02

**Status:** in-review

- [x] command 是純函式、吃 doc 吐 doc、Node 可測；沒有可序列化訊息 log
- [x] 去重：複製貼上觸發換新 id、剪下貼上保住 id；碰撞本身是唯一判別器
- [x] 去重 transaction 標 `addToHistory: false`（⌘Z 不會退回重複 id 的狀態）
- [x] `moveScene` 對非法目標回傳拒絕，不靠 UI 擋（縱深：UI 擋滑鼠，command 擋伺服器端呼叫與日後 API）
- [x] 准入判準寫成可檢查的規則；不滿足的操作留在編輯器當一般 Tiptap command
- [x] 不變式測試檔按 §11 編號組織，新不變式有明確落點
- [x] command 層可在 Node 跑（`EditorState`／schema／transaction 不需 `EditorView`）

## Comments

**實作（2026-09-02）** —— 全數落在 `packages/schema/src/commands/`，沿用票券 02 的 isomorphic 邊界（ESLint／`lib:["ES2022"] types:[]` 兩道鎖照舊通過）。新增相依：`prosemirror-state`／`prosemirror-transform`（皆無瀏覽器相依，不在 ESLint import 黑名單）。

| 檔案 | 內容 |
|---|---|
| `result.ts` | `CommandResult<T>` —— 非法輸入回傳 `{ ok: false, reason }`，不 throw |
| `identity.ts` | `MINT_MOMENTS`（§4.3 五個鑄造時刻的單一定義）＋ doc 走訪工具 |
| `tree.ts` | doc 頂層子節點的不可變陣列操作 |
| `create-next-scene.ts` | `createNextScene(doc, { afterSceneId? })` —— 鑄造時刻 `createScene` |
| `set-block-type.ts` | `setBlockType(doc, { sceneId, blockIndex, type })` |
| `move-scene.ts` | `moveScene(doc, { sceneId, target })` —— 自己拒絕非法目標 |
| `dedupe.ts` | 純函式 `dedupeSceneIds` ＋ `dedupeIdsPlugin()`（`appendTransaction`、`addToHistory: false`） |
| `admission.ts` | 准入判準 ＋ edge-boundary 規則，寫成 `COMMAND_CONTRACTS` ＋ `satisfiesAdmission`（測試逐一斷言） |
| `invariants.test.ts` | §11 總表的家：每條不變式一個 `describe`，⑥⑦ 實測、其餘 `it.todo` 指名落地票券 |

**一個對規格的偏離（`setBlockType` 的定址）**：§6.3／ADR-0007 的範例簽名是 `setBlockType(blockId, type)`，但票券 02 的 schema 沒有給 `action`／`dialogue`／`insertShot` 任何 id（§5.1 節點表也沒有）。改用 `{ sceneId, blockIndex }` —— 場次以永久 id 定址，區塊以**呼叫當下算出、不被儲存的序**定址。這正是 §5.2 給 `assignFragmentToMember(groupId, fragmentIndex, …)` 的 `fragmentIndex` 立下的先例（保護規則 2／3 禁的是持久化的位置引用，傳遞參數不在此列）。若日後要給區塊永久 id，只需擴 schema，command 簽名換掉 `blockIndex` 一個參數。

**驗收**：`pnpm lint`／`typecheck`／`test`（94 passed + 12 todo）／`build` 全綠。`/code-review` 跑過，無 correctness 缺陷；兩條 low-severity 效能建議（plugin 路徑重複走訪 doc、丟棄 `dedupeSceneIds` 重建的樹）已折入 —— 抽出 `planRemints` 讓純函式與 plugin 共用一次 `sceneIdNodes(doc)` 走訪，plugin 直接 `setNodeMarkup` 不重建整棵樹。
