# doc 為唯一權威，寫入只走 command abstraction

劇本存成**一份 ProseMirror JSON**（PostgreSQL 的一列、`jsonb` 欄位）。兩根支柱：

> **① doc 是結構與場次 metadata 的唯一權威。**
> **② 所有寫入只有一個入口：domain command 層。**

關聯式表只裝**本來就不在 doc 裡的東西**：專案、劇本、人物、地點、交付快照。它們是衍生的或獨立的，永遠不是 doc 內容的第二份副本。

## 這條決策要解的問題

劇本同時要被兩種東西讀：**編輯器**（一棵樹，巢狀的子場次、群組、區塊）與**製作端**（場次表 —— 製片拿去排通告的那張表）。直覺的作法是讓場次成為資料庫的一列，好讓場次表能下 SQL。

那條路會製造**兩個寫入者**，於是要雙向同步，於是長出一整個靜默 bug 家族：**場次表印的地點與劇本不一致**。而它還直接撞上架構約束 3（不得堵死協作）—— CRDT 只保護它管得到的單一結構，metadata 若住在表裡，協作時是「後到的贏、前者無聲消失」；日後要加同步層，得先把 metadata 搬回 doc，而那時已經有真實使用者的資料。

判準是客觀的，不是偏好：**場次／子場次／區塊／群組／場次 metadata 是編輯器裡打出來的，樹就是它們的形狀**；**人物與地點屬於專案、跨劇本、append-only**（[ADR-0005](./0005-entities-exist-by-reference.md)），從來不住在某一棵樹裡。

## Considered Options

**純關聯式（場次、區塊各自成表）。** 否決。它裝不下已經定案的東西：子場次是巢狀節點（[ADR-0003](./0003-inserted-scenes-as-subscenes.md)），拆成列後父子與先後要靠 `parent_id`／`order` 重建 —— 正是 ADR-0003 否決「平坦 + `depth`」的同一條理由；**片段在 v1 沒有 id**（[ADR-0006](./0006-continuous-action-as-continuation-subscenes.md) 保護規則 3 明文禁止），沒有 id 的東西存不進列。而真正的理由是**原子性**：ProseMirror 的一個 transaction 是對整棵樹的原子變更，我們有一堆天生跨場次的變更（帶子場次的主場次被拖走、刪父場次一併刪子場次、⌘Z 一步還原整棵子樹、`appendTransaction` 改寫撞號的 id）。一場一列時它們變成 N 次列寫入，**寫到一半失敗 ＝ 一份違反不變式的劇本**。

**混合，且表也是權威**（場次 metadata 進表以便查詢）。否決 —— 就是上面那個兩個寫入者的問題。

**混合，但表永遠是衍生的。** 採用。

## 支柱 ② 的形狀

「唯一權威」翻譯成工程語言就是**寫入只有一個入口**。三層各司其職：

```
domain command（意圖） → ProseMirror Step（機械變更／日後的傳輸單位） → doc（唯一權威、唯一被持久化）
```

**command 是程式碼，不是資料。** isomorphic TS 模組、純函式、吃 doc 吐新 doc。否決「command 是可序列化的訊息、可寫 log、可重播」—— 那會製造第二個權威（log 與 doc 誰是真相），不知不覺走進 event sourcing；而它想要的東西 ProseMirror 已經給了：**`Step`**。

**真正的獲利不是「多入口」**（v1 只有一個寫入入口）**，而是給不變式一個家 —— 且是在瀏覽器外可單元測試的家。** 目前無家可歸的四條：主場次的內容必須以自己的內容開始（ADR-0006 ①）、子場次 metadata 不得與主場次全同（ADR-0006 ②）、群組成員之間 metadata 不得全同（ADR-0004）、群組不能巢狀且一場次不得屬於兩個群組（ADR-0004）。

**准入判準**（免得長成「每個 Tiptap command 包一層」的空殼）：

> 一個 domain command 要能進來，必須至少滿足其一：**它強制執行了一條不變式**，或**它以 `sceneId`／實體 id 定址（而非以位置定址）**。

**edge boundary 規則**：

> **UI 與 application 層不得直接依賴編輯器的實作細節** —— 包含 transaction、mutation、`history`、以及以**位置**定址的任何東西。**凡具備 domain 或 application 意義的操作，一律透過 command abstraction 執行。**

邊界說明（否則會被讀成「不准用 ProseMirror」）：**編輯器套件內部**照常直接用 ProseMirror API（node view 怎麼畫簡表、`Tab` 怎麼排環、拖曳落點判定、注音組字期間選單不動作）。規則管的是**跨出編輯器邊界**的線。編輯器對外只曝露兩樣東西 —— **commands（寫）** 與 **projection（讀）**。

**意圖 vs 手勢的分界**（這條線一鬆，command 層就會被 UI 細節污染而測不動）：

| 手勢（留在編輯器） | 意圖（就是 command） |
|---|---|
| `Tab` 怎麼排環 | `setBlockType(blockId, type)` |
| `/` 選單怎麼過濾、IME 組字期間不動作 | `insertSubscene(parentId, kind, meta)` |
| `⌘+1/2/3` 直接定址、`⌘+4` 是無效鍵 | `assignFragmentToMember(...)` |
| 拖曳時哪些位置不畫落點線 | `moveScene(sceneId, target)`（**它自己也要拒絕非法目標**） |
| 自動補全選單三列怎麼排 | `createLocation(name)` / `renameLocation(id, name)` |

最後一列的「它自己也要拒絕非法目標」是**縱深不是重複**：落點線是 UI 的預防，command 的拒絕是模型的保證；UI 只擋得住滑鼠，擋不住伺服器端呼叫或日後的 API。

## 讀取邊界：projection

場次表**不建投影表**，在讀取當下由純函式推導：

```
projectSceneTable(doc) → SceneTableRow[]
```

**這個簽名裡沒有 doc 以外的輸入，型別本身在強制「場次表是零新增資訊的投影」** —— 有人想加一欄製作端另填的東西時會發現簽名裝不下，比文件裡的一句話有力。PDF、場次表、匯出前草稿清單共用同一次走訪（場次號、草稿判定、群組成員展開），不會長出兩套會分歧的實作。

投影表日後要加是免費的：它就是這個函式輸出的**快取**，key 是 `doc_seq`，要重建就 `DROP` 再跑一次。（快取要跟上 doc；**交付快照與凍結分享連結是快照，方向相反 —— 刻意不可變、抵抗 doc**。）

## 引用完整性：寫入嚴格，讀取容忍

doc 裡的實體引用是 `{ 實體 id, 這一場顯示的名字 }`，實體住在 `characters`／`locations` 表。資料庫**沒有能掛外鍵的地方**（見下「資料庫不知道場次的存在」）。裁決是一組**刻意不對稱**的規則：

> - 這裡確保的是 **command-level referential integrity，不是真的 FK**，所以**系統不能保證懸空引用不會發生**；但**所有 domain command 必須拒絕**建立對不存在實體的引用。
> - **doc 必須允許引用不存在的實體。** 懸空引用不影響渲染 —— **顯示名是渲染權威（fallback 來源）**，PDF 照印、場次表照印，只是少一條可聚合的連結。
> - **建立實體時，先建立實體、再寫入 doc。**（這不只是建議順序，它是上一條能成立的前提：檢查對象是實體表。）

**兩半要並排寫進規格書**，否則後人會把其中一半當 bug 修 —— 有人會想在 projection 裡擋掉懸空引用（那會讓 PDF 少印一個地點，是投獎者最糟的失敗模式），也有人會想讓 command 放行以求彈性。

否決「載入時用顯示名自癒補一筆」：它是**讀取路徑的寫入**（外人打開唯讀分享連結時寫我們的資料庫），而且**補出來的名字是錯的** —— ADR-0005 明說實體的名字是真欄位不是推導值，漸進揭露下前 8 場的顯示名是「未知大樓房間」，自癒會把假名鑄成正式名字，而製片要知道去哪裡拍。

引用缺失只做診斷：`projectSceneTable` 額外回傳 `missingRefs`。**它是 projection 的診斷輸出（diagnostic output），不是業務輸出** —— 不參與渲染、不被持久化、消費者的業務邏輯不得讀它。

## 資料庫不知道場次的存在

**沒有 `scenes` 登記簿。** 理由同 ADR-0005 的**存在＝被引用**：場次「存在」就是它在那棵樹上。登記簿等於第二份權威，而它唯一的好處（外鍵完整性）在 v1 沒有消費者。

`sceneId` 因此**由編輯器端產生並存在節點的 attr 上**（`sc_` 前綴的 nanoid，見 [ADR-0002](./0002-scene-id-and-derived-scene-numbers.md)）。**不必在編輯器與資料庫之間保持一致，因為資料庫沒有要跟著同步的副本**；唯一的一致性要求是**同一份 doc 內 id 不得重複**，由 `appendTransaction` 在編輯器內修復（標 `addToHistory: false` —— 它是模型的修復，不是使用者的動作）。

## 儲存與並行

| 欄位 | 是什麼 | 什麼時候變 |
|---|---|---|
| `doc_schema_version`（integer） | 這份 doc 用哪一版 node schema 寫的 | **部署時**（我們改了 schema） |
| `doc_seq`（bigint） | 並行控制 token | **每次成功改變 canonical document state** |

一個隨程式碼走、一個隨資料走。命名刻意避開 `CONTEXT.md` 對交付快照列出的 Avoid 詞（版本／版次／revision／鎖定），因為**版本鎖定是已否決的功能**：

> `doc_seq` 是每一次**成功改變 canonical document state** 的 optimistic concurrency token。它不是自動存檔次數、不是版次、不是任何產品概念。不對使用者曝露，與交付快照無關。

**遷移採 lazy，且永遠在記憶體中發生；寫回只發生在本來就會寫的路徑**（使用者存檔、伺服器端 command），**讀取路徑一律不寫回**。**schema migration、doc 更新、`doc_seq` 遞增是同一個原子操作**，並沿用 `doc_seq` 的並行檢查。

**丟稿保險**：一張 append-only 的自動備份表存 **before-image**，無 UI、v1 全部保留。**它是 recovery 機制，不是版本歷史功能。** 凡依 backup policy 判定需要建立備份的那次存檔，**備份與 canonical document update 必須是同一個 atomic state transition**。硬保證只有一條 —— **距上一筆備份 ≥ 2 小時就先寫一筆**，對外可講成「任何時候最多只會退回兩小時」。（「距上次存檔 ≥ 30 分鐘視為新的一次坐下」只是實作層的 heuristic，**不是規格層級的不變量**：它的語意是系統對使用者行為的**推測**。它安全，因為它只會讓備份變多、絕不會變少。）

## 這條決策沒有堵死協作（架構約束 3）

**「從第一天就存 Yjs」不是加同步層，是把權威資料的形狀換掉。** 否決，四個代價：伺服器每一條讀 doc 的路徑（PDF 匯出、場次表推導、唯讀分享連結、伺服器端執行 command）都要跑一個有狀態的 Yjs runtime；**儲存變不透明**（劇本工具最可怕的故障是「某位編劇的劇本壞了」，那種故障需要能用眼睛看）；`y-prosemirror` 是**第二層**要協商的預設行為，而我們有幾個載重的自訂行為正好落在那層；**Yjs 不是「協作完成」按鈕** —— CRDT 保證收斂但不知道我們的不變式，合併出來的樹可能違反「群組不能巢狀」。

**為了不堵死那條岔路，v1 守四條**（沿用 ADR-0006 留升級路徑的手法）：

1. schema 是 **isomorphic** 的獨立模組，不含任何瀏覽器相依（node spec 與 node view 分家）—— 日後 `y-prosemirror` 吃同一份 schema。
2. 所有節點一律靠 attr 上的**永久 id** 定址，不靠位置、不靠場次號。
3. **「整份 doc 覆蓋」這個假設不准散進程式各處** —— 存檔集中在一個 persistence 模組後面，呼叫端只知道「存」與「載入」。（自動備份的判定也住在這裡。）
4. **undo 只透過 command 層對外曝露**（已被 edge boundary 規則吸收）。

⚠️ **「日後遷移不貴」這條事實是承重的且未實測** → 票券 19。

## doc 之外的東西落在哪

- **交付快照 → 自己一張表**（append-only）。它是系統裡**唯一刻意不可變**的東西，因此**沒有** `doc_schema_version` 與 `doc_seq` —— 不被載入編輯、不遷移。那正是它與其他所有東西的分野。
- **分場大綱、角色設定表 → `documents` 表**（`screenplay_id`／`kind`／`body jsonb`），body 皆為 ProseMirror doc。每個 `kind` 有自己的 schema 與自己的遷移鏈，所以那一列的 `doc_schema_version` 是**該 kind 的版本**，不是全域數字。
- **人物與地點掛專案；劇本 doc 與 `documents` 掛劇本。** v1 專案與劇本為 1:1。

角色設定表選 PM doc 而非關聯表 `(screenplay_id, character_id, order)`，是為了**讓引用只有一種住所**：關聯表可以掛真外鍵，但那個外鍵沒有消費者（ADR-0005 下人物 append-only、永不刪除），而代價是 ADR-0005 的「存在＝被引用」判定得同時掃 doc 又掃表，上面的引用完整性規則也要長出第二套實作。

> ### ⚠️ 這一項是有效期條件的，不是永久不變量
>
> **PM doc 方案成立的前提是：角色設定表的職責僅止於「有序人物引用清單 + PDF 排版來源」。**
>
> 若它日後演化為具有**篩選、分類、群組、搜尋**能力的 **entity browser**，就應重新評估它是 document 還是 **projection/view**。
>
> 重新評估的觸發條件是可指名的：地圖 Not yet specified 的「**按實體聚合的地點／人物清單視圖**」那塊迷霧畢業之時 —— 那正是 entity browser。（作者要求記於此，**避免未來把暫時決策誤認為永久不變量**。）

## 邊界一覽

```
canonical document = ProseMirror JSON
storage            = jsonb
schema version     = doc_schema_version
concurrency        = doc_seq
write boundary     = commands
read boundary      = projection
migration          = schema migration
backup             = append-only before-image（recovery，不是版本歷史）
future collaboration = Yjs（待票券 19 驗證）
```

（票券 04，2026-08-30）
