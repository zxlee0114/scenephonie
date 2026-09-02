# 06 — 認證、授權 gate、`ownerId` 與專案 hub

**What to build:** v1 從第一天就是多租戶。**Better Auth `~1.7.x`**、Google OAuth（magic link 不進 v1，密碼出局）。`users.id` 由我們控制：`usr_` + nanoid（比照 `sc_`／`gr_`）；auth library 隨附表（`session`／`account` …）存在，但 **domain 只讀 `users.id`、永不讀 `account`**（一條 grep 可驗，[ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)）；**不做 shadow table**（「換 library 時 `owner_id` 不動」直接免費拿到）。`projects` 表：`id`、`type`（單一劇本專案，v1 唯一，不做類型選擇 UI）、`title`、`owner_id`（→ `users.id`）、meta 欄位；回填 `screenplays.project_id`。identity chain：`Scenephonie UserId → users.id → projects.owner_id`。allowlist 是 Google OAuth 的 registration/access policy，實作為 **env var 逗號清單**，**不建 `invitations` 表**。授權：application layer 的 gate；**command 只接受已授權的 project handle**，command 不負責建立 authorization（不變式 H）。middleware 只做 optimistic redirect，真正的 gate 在 route handler。DB session + cookie cache（`compact`，5 分鐘）。導覽（§7.10）：純 routes + 專案首頁 hub、編輯器頁只有極簡 header／breadcrumb 回專案；route tree `/projects/:id/screenplays/:id` 已編碼層級。基礎設施提供機制不提供授權真理（不變式 I、[ADR-0012](../../../docs/adr/0012-infrastructure-provides-mechanism-not-authority.md)）—— Supabase Auth／RLS 不作為權威來源。

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Google 登入後 land 在自己的專案；未登入被 optimistic redirect
- [ ] 另一個使用者對非自己的專案，route handler 的 gate 回絕（不是靠 UI 藏）
- [ ] `users.id` 是 `usr_` + nanoid；一條 grep 可驗「domain 不讀 `account`」
- [ ] 不做 shadow table；換 auth library 不需動 `owner_id`
- [ ] allowlist 是 env var；repo 內無 `invitations` 表
- [ ] command pipeline 只接受已授權的 project context；authorization 不在 command 內
- [ ] 專案首頁 hub 以純 route 呈現，無文件 sidebar；breadcrumb 回專案
- [ ] Supabase 僅作 PostgreSQL 託管；其 Auth／RLS／Storage／Realtime 不作為授權權威
