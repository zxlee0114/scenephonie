# 認證方案與專案擁有者欄位

Type: grilling
Status: open
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
