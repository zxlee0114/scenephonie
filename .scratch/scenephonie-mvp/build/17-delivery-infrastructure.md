# 17 — Delivery Infrastructure

**What to build:** 交付的資料模型與寫入順序，**先於任何渲染器**（驗的是資料模型，不是輸出品質）。`deliveries` 表：`id`、`screenplay_id`、`created_at`、`payload jsonb`；append-only、**唯一刻意不可變**、**無 `doc_seq`／`doc_schema_version`**（不被載入編輯、不遷移）。存的是**推導的結果**（場次號等語意推導值），**不是推導的輸入**（否則編號演算法改了、日後重跑會算出不同號碼，等於讓程式碼回頭改寫歷史）。順序：**先提交交付，再渲染** —— atomicity 邊界縮成只有一個交易（建立交付），其餘全是它的純函式。交付是**事件不是狀態**：同一份劇本重複匯出 ＝ 兩筆交付，不去重；「產物尚未成功產生」是合法狀態，**不設狀態機旗標**，重試 ＝ 用同一筆交付重新渲染、不產生第二列。不變式 D（application：任何對外承諾「在後續 canonical state 改變後仍保持不變」的動作，都必須先建立一筆交付，該動作輸出的一切都指向那筆交付）。不變式 E（渲染器日後的純視覺變更**可以**影響已存在的交付，但**不得重新計算**該次交付已承諾的語意推導值）。「一筆交付必須能獨立重建它承諾的語意」——寫成能力，不寫成欄位（存不存 doc 是 persistence concern）。交付與自動備份**不共用**（性質、UI、清理策略、`doc_seq` 四項全相反，§10.4）。

**Blocked by:** 14, 05

**Status:** in-review

- [x] 匯出意圖觸發時建立一筆 `deliveries`，payload 是推導結果（含場次號），非場次樹
- [x] 同一劇本連續兩次匯出 → 兩列，不去重
- [x] 重試用同一筆交付重跑，不產生第二列；無「產物未產生」的狀態機旗標
- [x] `deliveries` 無 `doc_seq`／`doc_schema_version`，不被遷移
- [x] 建立交付是單一交易，是 atomicity 邊界；語意推導在交易內完成
- [x] 不變式 D／E 有測試：語意推導值一旦承諾就不被重算
- [x] 交付路徑與備份路徑在程式碼中分離，不共用寫入機制

## Comments

**2026-10-22 實作（使用者裁決：payload 裝完整可讀稿）。** 「一筆交付必須能獨立重建它承諾的語意」—— 只存
`sceneId → 場次號` 單獨讀不出是哪場戲，所以 payload v1 是：

- `scenes`：正式場次依文件順序（同場次表列序），每場帶場次號、主場次／群組歸屬、景、光、地點與登場人物的
  `{ name（交付當時的實體名，懸空為 null）, displayName }` 快照、群演印好的字。
- `script`：閱讀順序的元素 —— `heading`（只記 `sceneId`）、`action`、`dialogue`（說話者顯示名＋發聲方式）、
  `insertShot`、`returnTo`（折返，帶地點顯示名）、`intercut`（以下對剪的宣告）、`fragment`（片段歸屬的成員）。
  只記結構事實，「以下對剪」「回到」「INS」的字由渲染器決定（約束 2）。
- `version`：payload 形狀版本，**不是** doc 的 schema 版本 —— 交付不被遷移，讀取端靠它認舊形狀。

落點：`packages/schema/src/delivery.ts` 的 `projectDelivery(doc, names)`（純函式）；
`apps/web/src/persistence/delivery-store.ts` 的 `createDelivery`／`loadDelivery`（`repeatable read` 單一交易：
讀已存檔的 doc ＋ 實體名 → 推導 → 寫入）；`createDeliveryAction`（先過 gate）。沒有 UI —— 匯出按鈕歸票 18，
它要先把編輯器手上的存掉再呼叫（承諾的是 canonical state）。

延伸裁定（實作時順手定的，留給 18 檢查）：
- **草稿整場不進交付**，含草稿子場次；草稿子場次不算「走開過」，它前後的主場次內容之間不記折返。
- **空區塊不算內容**，不進 `script`。
- 群組只剩一個正式成員時不宣告對剪，那一場像一般場次一樣印。
- 歸屬標記「顯示名相同時補印區別欄位」**沒有**在這裡預先算好 —— 渲染器從 `scenes` 裡成員的 metadata 取。
  若 18 認為那是語意推導值（不變式 E），升 `version` 把它加進 `fragment`。
