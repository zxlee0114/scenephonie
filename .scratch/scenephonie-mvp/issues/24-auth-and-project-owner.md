# 認證方案與專案擁有者欄位

Type: grilling
Status: resolved
Blocked by:

## Question

從地圖迷霧「認證方案」與「專案的擁有者概念」畢業（2026-08-31，[票券 06](./06-mvp-spec-writeup.md) 寫規格書時）。**兩團霧合成一張票，因為它們耦合**：owner 欄位裡放什麼、指向哪張表，取決於認證選了什麼形狀。

### 為什麼現在才夠銳利

[票券 12](./12-share-link-live-or-frozen.md) 已經把範圍砍掉一半：**唯讀分享連結是 by-token 的公開存取，讀者端不需要帳號**，所以認證只涵蓋**編劇自己這一側**。單人、單一劇本專案、沒有多角色權限（那已在 Out of scope）。範圍收斂之後問題才問得出來。

### 要回答

1. **自建 vs 第三方服務？** 第三方是哪一個（Auth.js／Clerk／Supabase Auth／…）？判準是什麼 —— 成本、鎖定程度、與部署平台的耦合（見[票券 25](./25-deployment-and-hosting.md)）、日後加協作時的擴充性（約束 3）。
2. **登入方式**：email magic link／OAuth／密碼？台灣編劇的實際習慣是什麼？
3. **專案要不要現在就有 owner 欄位？**
   - 支持現在就加：約束 3（不得堵死協作）；[票券 07](./07-scene-numbering-and-anchor.md) 的交付快照與 [ADR-0006](../../../docs/adr/0006-continuous-action-as-continuation-subscenes.md) 的 `種類` 都立過「寫入時免費、事後補不回來」的先例。
   - 反對：owner 與那兩個先例**不同類** —— 它不是「編劇本來就會產生的副產品」，單人 v1 之下它的值是唯一的，日後補一欄 nullable 再 backfill 是廉價遷移。與[專案類型](../../../CONTEXT.md)那條裁決（「單一值的列舉日後補一欄帶預設值是廉價遷移」）同構。
   - **要判的就是它比較像哪一組先例。**
4. **owner 指向什麼**：我們自己的 `users` 表，還是第三方的 subject id？這一題直接由第 1 題決定。

### 不在這張票內

- **多角色帳號與權限** —— Out of scope，先用唯讀分享連結驗證劇組是否真的需要這些資訊。
- **讀者端的存取控制** —— [票券 12](./12-share-link-live-or-frozen.md) 已定：token opaque 不可枚舉、撤銷寫 `revoked_at` 保留該列、v1 無有效期。
- **部署平台** —— [票券 25](./25-deployment-and-hosting.md)。但兩張票的答案會互相限制，先做完的那張要把結論餵給另一張。

### 它擋什麼

**擋部署，不擋開工。** [規格書](../spec.md) §13.2 的階段 0–2（isomorphic schema、command 層、編輯器）完全不需要知道這張票的答案。

---

## Answer

**一句話：認證是可替換的 infrastructure，授權是 domain 的責任 —— 見 [ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)（不變式 H）。**

這張票原本問的是「選哪個 auth library、要不要現在加 owner 欄位」。兩題都答了，但**這張票真正的產出是那條責任邊界** —— 選型反而是它底下最可替換的一層。

### 1. 這張票把自己的第 3 題問偏了，修正後結論才站得住

票券把 `ownerId` 擺成「像交付快照那組（寫入時免費、事後補不回來），還是像專案類型那組（單一值列舉、日後補一欄廉價）」。**兩組都不是。**

地圖 Notes 寫著產品給作者與**身邊編劇朋友**使用 → 同一個部署上有多個帳號 → **v1 從第一天就是多租戶的**。「這個 project 是不是你的」不是為協作預留的問題，是 v1 每次讀寫都要回答的問題。沒有 `ownerId`，任何登入者都能開任何人的劇本。

➡️ **`ownerId` 現在就加，理由是「v1 authorization 的必要資料」，不是「日後補不回來」。** 但它被定義成 **v1 authorization 的最小掛點**，不是 authorization 的永久模型 —— 未來演進成 members／invitations／organization 時是在它之上加東西，不必否定它。

### 2. 責任邊界（作者在第二輪補的問題，比選型重要）

| 層 | 回答的問題 |
|---|---|
| Authentication | 你是誰 |
| Authorization | 你能操作哪個 project |
| Domain command | 這個操作是否合法（與人無關） |
| Document | canonical state |

**auth library 只提供 identity/session，不得成為 domain authorization 的真理來源。**

不變式 H 的措辭刻意寫成**責任歸屬**而非時序 ——「command 不負責建立 authorization；write use case 只接受已授權的 project handle」，而不是「授權必須發生在 command 之前」。後者一換架構就變成假規則。

否決「授權寫進 command 層」的理由：[ADR-0007](../../../docs/adr/0007-document-as-single-authority.md) 的 command 層是不變式的家，而不變式答的是「這個操作對**這份 doc** 合不合法」—— 與人無關。塞 `userId` 進去會讓每條 command 多一個與領域無關的參數，並讓[規格書 §11](../spec.md) 的不變式測試綁上使用者。

**具體形狀**（可替換，不寫進不變式）：gate 取得已授權的 project handle，write use case 只吃 handle。這讓「沒授權就呼叫 command」在**型別上表示不出來** —— 與票券 09 否決 `depth` 旗標、票券 17 否決指標是同一招。

### 3. 自建 vs 第三方：拆成兩層來答

作者拒絕把「自建」等同於「選 Better Auth」，拆成：

- **domain 只認自己的 `UserId`**，Clerk／Google subject 等 provider identity **不得滲進 domain**。
- **authentication provider / library 是 infrastructure decision，可以替換。**

➡️ **自己的 DB ＋ auth library。** 三個理由：

1. **它讓票券 24 與 [票券 25](./25-deployment-and-hosting.md) 解耦** —— 25 無論選什麼平台，認證都不用重來。
2. **否決 Supabase Auth**：它會讓認證反向決定資料庫託管，且 RLS 與 ADR-0007「寫入只走 domain command 層」在同一個位置放兩套授權真理。
3. **否決 Clerk**：使用者只以 `subject id` 字串存在本地，違反第 1 條拆分；且協作模型會被它的 Organizations 形狀綁住。

**Better Auth 是目前優先候選，但不是本票的裁決** —— 成熟度、Next.js／Drizzle 整合、session model 先交給 **[票券 30](./30-better-auth-evaluation.md)**（research，AFK）確認再定 implementation。

### 4. identity chain 與表的形狀

➡️ **一張由 Scenephonie 控制的 `users` 表，不做影子表。**

`Scenephonie UserId → users.id → projects.owner_id`

- auth library 的 Drizzle schema 進**我們的** migration、我們的 Postgres。
- **`users.id` 的產生規則由我們控制**：`usr_` + nanoid，比照場次的 `sc_` 與群組的 `gr_`（[ADR-0002](../../../docs/adr/0002-scene-id-and-derived-scene-numbers.md) 的先例）。這樣換 library 時 `projects.owner_id` 一個字不動 —— 影子表想保護的東西直接免費拿到。
- provider identity（Google `sub`）住在 library 的 `account` 表、FK 指向 `user`。**domain 只讀 `users.id`，永不讀 `account`** —— 一條 grep 就能驗的規則。

⚠️ **這條有一個未驗證的前提**：Better Auth（或替代品）必須讓我們控制 `user.id` 的產生規則。這是[票券 30](./30-better-auth-evaluation.md) 的 **blocking acceptance criterion**，原則是「**infrastructure 不應迫使 domain identity 改變**」。若不成立，才回頭評估 shadow table —— **而不是反過來為了 library 修改 domain model**。

### 5. 登入方式：Google OAuth 進 v1，magic link 延後

判準是「**v1 實際使用者是否需要第二種登入方式**」，不是「多做一種很便宜」。magic link 不只是設定成本，它增加 **email delivery、token lifecycle、account linking** 的 operational surface。

**作者提供的領域事實**：v1 真實使用者預計 **< 10 人，且全部有 Google 帳號**。

➡️ **Google OAuth 進 v1；magic link 不進 v1**，且不為它購買網域或建立 email delivery infrastructure。未來出現實際使用者不是 Google 為主，才重新評估。**密碼直接出局。**

### 6. 訪客體驗（demo access）：另一個 authentication entry point，不是授權例外

Scenephonie 同時是作者的面試作品，面試官要能直接體驗而不必完成 Google 登入。**這個需求不反過來推導出 magic link。**

➡️ **登入頁一顆「以訪客身分體驗」入口**，不要公開測試帳密（那會把剛否決的密碼從後門放回來）。

➡️ **每次進入建立 ephemeral user ＋ clone 一份 demo project，不使用共用帳號。**

否決共用帳號的理由有兩條，第二條更重要：

1. v1 **沒有同步層**（即時協作在 Out of scope），而儲存模型是**一個劇本一列 jsonb、每次自動存檔整列重寫**（[票券 04](./04-screenplay-storage-model.md)）→ 兩位面試官同時開同一個 demo project，後寫的整列蓋掉前一位。這是 last-write-wins 的定義，不是理論風險。
2. 它打破「**一個 `user` 列 = 一個人**」這個假設，並讓 owner 這個概念**在唯一一個外人會碰到的地方失效**。

ephemeral 形狀讓兩條入口收斂進同一條 pipeline：

```
Google OAuth → User → Project.ownerId → Authorization → Command → Document
Guest entry  → User → Project.ownerId → Authorization → Command → Document
```

**domain 不需要知道這是一個 demo user，也不需要為 demo 增加任何 authorization 例外。** 這是保持一致性的方式，不是為 demo 犧牲一致性。

`is_demo` 定位為 **infrastructure / lifecycle metadata，不進 domain model**（與 `account` 表同一條線）。清理保持簡單：TTL / scheduled cleanup，**不另外建立 demo lifecycle domain**。

### 7. Allowlist

➡️ **v1 不公開註冊，走 email allowlist，用 env var 逗號分隔清單、不建 `invitations` 表。**

- **理由是產品邊界**，不是儲存成本：v1 的使用者就是作者本人與明確邀請的編劇朋友，沒有必要把產品做成公開 SaaS。
- 建表等於在 v1 就把 members／invitations 的形狀猜出來，而那要留給未來演進。env var 是一個**看得出來是暫時物**的東西，不會假裝自己是領域模型 —— 建了表，它就會開始長欄位。
- **allowlist 的定義是「Google OAuth 的 registration/access policy」。** Guest 入口不進 allowlist，但也**不因此取得任何超出正常 User authorization model 的權限**。

### 8. 授權主體不只有 UserId

[票券 12](./12-share-link-live-or-frozen.md) 的 `/s/<token>` 唯讀分享頁沒有帳號，卻仍要決定能看哪個 project。

➡️ **`ShareViewer` 是另一種 authorization subject，不是第二套授權機制**（否則會長出平行真理，正是不變式 H 要防的）。**寫路徑不接受它。** 具體型別（和型別？兩個 gate？）**延到分享連結實作時決定**（階段 8），但形狀在階段 3.5 就先認識到，避免屆時回頭改每個 gate 的簽名。

### 9. 實作順序：新增階段 3.5

[規格書 §13.2](../spec.md) 原本只說「階段 0–2 不需要知道本票的答案」，沒說本票自己在哪。

➡️ **階段 3.5：authentication ＋ authorization gate ＋ `ownerId`**，緊接階段 3（persistence）。理由：persistence 一出現，「這是誰的資料」就同時出現 —— 一個沒有 owner 的 `screenplays` 表，之後每一張掛上去的表都得回頭補。`ShareViewer` 那一側留到階段 8。

### 餵給票券 25 的結論

- 認證**不再約束部署平台**（自架 library ＋ 自己的 Postgres）。25 少一條約束。
- 但 [票券 30](./30-better-auth-evaluation.md) 的第 3 項（session model：DB session vs JWT、與 Next.js middleware／Edge 的關係）**會回頭餵給 25**。
- **不需要 email delivery infrastructure**（magic link 不進 v1），25 不必為寄信服務留位置。
- **不公開註冊**，25 的儲存成本估算從「不可知」變回「乘以個位數」，但要加上 demo ephemeral project 的 clone 量（受 TTL 清理約束）。
