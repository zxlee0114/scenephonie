# ProseMirror doc → Y.Doc 遷移可行性 spike

Type: prototype
Status: resolved
Blocked by: 03

## Question

票券 04（Q4）決定 **v1 存 ProseMirror JSON 而非 Yjs**，並以此正面回答約束 3（不得堵死協作）。

那個決定唯一承重的假設是：**日後從 ProseMirror JSON 遷移到 Yjs 很便宜**（一次性的離線腳本，純結構轉換）。這條假設目前是**從記憶推斷、未經實測**。

**若假設不成立，Q4 翻盤** —— v1 必須重新評估是否直接把 Y.Doc 存成 `bytea`，而那會連帶改變 undo 引擎（`Y.UndoManager` vs ProseMirror `history`）、伺服器端每一條讀取路徑、以及 Q3 選 `jsonb` 換來的除錯能力。所以本票券擋在**規格書定稿（票券 06）**前面。

要驗證三件事：

1. `y-prosemirror` 是否提供可用的 **ProseMirror doc → Y.Doc** 轉換？
2. 轉換是否**完整保住 node attrs**？`sceneId`、場次 metadata（內外／時間／地點／登場人物／群演）、子場次的 `種類` **全部存在 attr 上**，掉了任何一項等於資料毀損。
3. 反向轉回來（Y.Doc → ProseMirror doc）是否與原 doc 等價？

### 等價的定義（作者指定）

**以 document semantics 為準，不要求 JSON byte-level equality。** 至少要驗證：

- node type
- tree（結構與巢狀關係）
- attrs
- `sceneId`
- text
- marks

### 驗收素材

用票券 03 的原型 schema 產生一份**涵蓋所有已定案節點型別**的 doc：主場次、子場次（`種類 = 插入` 與 `種類 = 接續` 各一）、場次群組（多個成員 + 交錯片段）、三種區塊型別（動作／對白／插入畫面）、草稿場次、雜景場次（多值地點）。轉過去再轉回來，逐項比對上面六項。

### 產出

- 一份可重跑的腳本（放進 `prototypes/`）
- 結論：Q4 維持，或 Q4 翻盤（若翻盤，寫清楚是哪一項失敗、有沒有繞道）

## Answer

**定案日期**：2026-08-30。
**產出**：[`../prototypes/yjs-migration-spike/`](../prototypes/yjs-migration-spike/)，`pnpm install && pnpm spike`（Node 24，無建置步驟）。腳本以 exit code 表態，可重跑。

### 結論：六項驗收全過，**Q4 維持** —— 存 ProseMirror JSON，不存 Yjs

那條承重假設**成立**。`y-prosemirror` 提供 `prosemirrorToYDoc()` 與 `yDocToProsemirror()` 兩個方向的工具函式，遷移就是「讀出 doc JSON → `Node.fromJSON` → `prosemirrorToYDoc` → `encodeStateAsUpdate` → 寫進 `bytea`」，純結構轉換、無狀態、可離線批次跑。

| 驗收項 | 結果 |
|---|---|
| node type | ✅ |
| tree（結構與巢狀） | ✅ |
| attrs | ✅ |
| `sceneId` | ✅ |
| text | ✅ |
| marks | ✅ |

驗收素材涵蓋度（腳本自己清點並印出）：`scene×5`、`sceneGroup×1`、`groupMember×2`、`fragment×4`、`action×8`、`dialogue×5`、`insertShot×2`、`text×17`；特例：插入、接續、雜景、多值地點、草稿。

**往返中間刻意走了一趟真正的持久化** —— `encodeStateAsUpdate` 成 bytes、丟進一份**全新的** `Y.Doc` 再轉回來。少了這一步，測到的只是同一個記憶體物件轉來轉去，而遷移腳本真正要寫進資料庫的是 `bytea`。

### ⚠️ 但撿到一條 schema 的鐵律，必須現在就寫進去

Y.Doc 的內部表示露出一件事：`kind: null` **完全沒有出現**在 `Y.XmlElement` 的 attributes 裡。往返之所以等價，是因為 `kind` 的 schema 預設值剛好也是 `null`，回程時 ProseMirror 用預設值把它補了回來。**「null attr 遷得過去」是巧合，不是保證。**

真正的規則（已用 `src/hazard.ts` 的探針實測證明，不是推測）：

> `y-prosemirror` **不儲存 null attr**，回程一律由 **schema 預設值**填補。

探針的證據：一個 `default: '一般'` 的欄位裝 `null`，往返後**靜默變成 `'一般'`**。

**因此 Q4 的附帶規則加第 5 條：**

> **5. 任何可能裝 `null` 的 attr，schema 預設值必須也是 `null`。** 這條在 v1 是零成本的（現在就這樣寫），但事後補救的代價是**靜默改值** —— 遷移不會報錯，只會把某些場次的欄位換成別的值，而那是編劇的稿。

現成的受害候選就在眼前：對白的**發聲方式**（一般 / V.O. / O.S.，票券 03 已決定未實作）。若它寫成 `default: '一般'` 又允許 `null` 表示「還沒選」，遷移那天會把所有沒選的對白靜默標成「一般」。做法是**要嘛預設 `null`、要嘛不允許 `null`**，不要兩者兼有。

### 附帶收穫

- **Q4 附帶規則 1（schema 必須 isomorphic）第一次實地檢驗通過。** spike 的 `src/schema.ts` 只 import `prosemirror-model`，在 Node 裡直接跑，node spec 與 node view 分家是做得到的。
- **體積**：同一份 fixture，PM JSON 3696 bytes、Y.Doc update 3347 bytes（0.91×）。Y.Doc **沒有**顯著變大 —— 「換 Yjs 會撐大儲存」不是反對它的有效論據（有效的那三條仍然是伺服器 runtime、不透明、第二層預設行為）。
- **Q3（`jsonb` 買到的除錯能力）退多少，現在有具體答案**：Y.Doc 的 attrs 在內部是**結構化保存**的（陣列仍是陣列、布林仍是布林，見腳本輸出），不是壓成字串。所以換 Yjs 之後「能用眼睛看」不是歸零，而是從「`psql` 裡直接 `doc -> 'content' -> 0`」退成「得先跑一支解碼腳本」。這比原本假設的樂觀，但仍然是實打實的退步 —— 不改變 Q4 的結論，只是把代價量準了。

### 不在這張票內（留給遷移真正發生的那一天）

本票券驗的是**單機的結構轉換**，那正是遷移腳本要做的事。**協作合併的語意沒有驗，也不該在這裡驗** —— Q4 已經指出「CRDT 保證收斂但不知道我們的不變式」（群組不能巢狀、主場次的內容必須從自己的內容開始等四條），那是加同步層那天的題目，不是遷移可行性的題目。同理，`Y.UndoManager` 與 PM `history` 的語意差異也仍然成立，本票券沒有動搖它。
