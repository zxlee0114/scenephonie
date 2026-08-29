# ProseMirror doc → Y.Doc 遷移可行性 spike

Type: prototype
Status: open
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
