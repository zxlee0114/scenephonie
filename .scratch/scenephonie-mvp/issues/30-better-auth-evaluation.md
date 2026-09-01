# Better Auth 選型評估（對照 Auth.js v5）

Type: research
Status: open
Blocked by:

## Question

從[票券 24](./24-auth-and-project-owner.md) 畢業（2026-09-01）。24 已裁決**自架 auth library ＋ 自己的 Postgres**，並把 provider identity 隔離在 library 的 `account` 層（見 [ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)）。**Better Auth 是目前優先候選，但成熟度與整合細節未經驗證** —— 這張票就是去驗證它。

**這張票不重新裁決「自建 vs 第三方」**，那已定。它只回答「自架這條路上，哪一個 library，以及它會不會逼我們改 domain model」。

### Blocking acceptance criterion（先答這一條；答案為否就立刻回報，不必等其餘五條）

1. **`user.id` 的產生規則能不能由 Scenephonie 控制？** 具體是：`usr_` + nanoid 這種自訂格式的主鍵，能不能取代 library 的預設 id 格式，且 session／account／verification 等相關表的 FK 都跟著走。

   原則：**infrastructure 不應迫使 domain identity 改變。** 要確認的是這條 identity chain 能否成立：

   ```
   Scenephonie UserId → users.id → projects.owner_id
   ```

   **若不能成立**，才回頭評估 shadow table（library 自己的 `auth_user` ＋ 我們的 domain `users`，1:1），**而不是反過來為了 library 修改 domain model**。票券 24 §4 的「一張表」裁決屆時要重評。

### Architecture-critical

2. **Next.js App Router ＋ Drizzle ＋ PostgreSQL 整合現況**：schema 由誰擁有？migration 怎麼進我們的 Drizzle migration 鏈？library 升版時 schema 變更怎麼處理？
3. **Session model**：DB session vs JWT，以及對 Next.js middleware／Edge runtime／部署形態的影響。⚠️ **這一項要回頭餵給[票券 25](./25-deployment-and-hosting.md)。**

### Selection information

4. **成熟度**：版本、發布節奏、breaking-change history、實際採用面。
5. **擴充成本**：Google OAuth 現在、magic link 日後（票券 24 已裁決 magic link 不進 v1，但要知道加上去的代價）、以及 organization／members plugin 的形狀 —— 那是**約束 3（不得堵死協作）**的擴充路徑。
6. **Auth.js v5 在以上同樣五項的答案**，作為保守替代方案的對照。

### 不在這張票內

- **授權的責任邊界** —— [ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md) 已定（不變式 H）。無論選哪個 library，它都只提供 identity/session，**不得成為 domain authorization 的真理來源**。這張票的答案不得動搖那條邊界。
- **登入方式** —— 票券 24 已定：Google OAuth 進 v1、magic link 延後、密碼出局。
- **訪客體驗入口** —— 票券 24 已定形狀（ephemeral user ＋ clone demo project）。本票只需確認候選 library 能不能在**不經過 OAuth provider** 的情況下建立 session（訪客入口需要）。
- **部署平台** —— [票券 25](./25-deployment-and-hosting.md)。

### 它擋什麼

**擋階段 3.5 的實作，不擋開工。**[規格書](../spec.md) §13.2 的階段 0–3 不需要知道答案。
