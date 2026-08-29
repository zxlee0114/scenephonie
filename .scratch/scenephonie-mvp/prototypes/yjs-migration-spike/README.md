# ProseMirror doc ⇄ Y.Doc 遷移 spike

[票券 19](../../issues/19-yjs-migration-spike.md) 的產出。驗的是
[票券 04](../../issues/04-screenplay-storage-model.md) Q4 那條**承重且未實測**的假設：
日後從 ProseMirror JSON 遷移到 Yjs 很便宜（一次性離線腳本、純結構轉換）。

```bash
pnpm install
pnpm spike
```

需要 Node 24（用原生的 TypeScript 型別剝除跑 `.ts`，所以沒有建置步驟、沒有 tsx／esbuild）。
腳本以 exit code 表態：`0` = 往返等價，`1` = 有差異（差異明細印在輸出裡）。

## 結論

**六項驗收全過，Q4 維持。** 詳見票券 19 的 `## Answer`。

## 檔案

| | |
|---|---|
| `src/schema.ts` | isomorphic 的 prosemirror-model schema。**不含 Tiptap、不含 React、不含任何瀏覽器相依** —— 這正是 Q4 附帶規則 1 要求的形狀，所以這支 spike 順便是那條規則的第一次實地檢驗 |
| `src/fixture.ts` | 票券指定的驗收素材：涵蓋所有已定案節點型別的一份 doc |
| `src/equivalence.ts` | 六項比對器（node type／tree／attrs／sceneId／text／marks），以 document semantics 為準 |
| `src/hazard.ts` | 針對性探針：null attr 的真實規則 |
| `src/spike.ts` | 主流程 |

## 兩個刻意的設計

**一、往返中間走一趟真正的持久化。** `encodeStateAsUpdate` 成 bytes、丟進一份**全新的**
`Y.Doc`、再轉回 PM。少了這一步，測到的只是同一個記憶體物件轉來轉去，而遷移腳本
真正要寫進資料庫的是 `bytea`。

**二、等價只做一項正規化。** 把 inline 內容攤成 (文字, marks) 的連續段落、相鄰同 marks 者合併 ——
因為 text node 的切法是儲存細節不是文件意義。除此之外一律嚴格比對，**attrs 不做任何寬容**
（掉一項就是資料毀損）。這是作者指定的「以 document semantics 為準，不要求 JSON byte-level equality」。

## `src/schema.ts` 與正式 schema 的差別

這是丟棄式程式碼，但形狀是照決策寫的，日後正式 schema 可以參考：

- **主場次與子場次是同一個節點型別**，差別只在 `kind`（`null` / `插入` / `接續`），
  content 寫成 `sceneBlock+ scene*` —— 直接把 ADR-0006 不變式 ①（主場次的內容必須以自己的內容開始）
  編碼進 schema
- **群組成員沒有自己的內容**（ADR-0004），所以 `groupMember` 是 leaf node；內容在 `fragment` 裡，
  片段以 `memberSceneId` 標記歸屬且**不給自己的 id**（ADR-0006）
- **雜景**的 `location` 裝 `string[]`，其餘場次裝 `string`
- schema 裡有一個 `emphasis` mark，**v1 並沒有它**（票券 03 把粗體斜體全關掉了）。
  它只為了第六項驗收（marks 是否等價）而存在
