# 認證身分不直接授予領域權限

[票券 24](../../.scratch/scenephonie-mvp/issues/24-auth-and-project-owner.md) 要決定認證方案與 `ownerId`。但在選 library 之前，先冒出一個更承重的問題：**auth library 到底在系統裡負責到哪裡為止。**

> **不變式 H：Authentication identity 不直接授予 domain authority；domain write operations 必須以已授權的 project context 進入 command pipeline。**

## 這條決策要解的問題

v1 從第一天就是**多租戶**的 —— 同一個部署上有作者本人與受邀的編劇朋友，各自擁有自己的專案。所以「這個 user 能不能改這個 project」是每次寫入都要回答的問題，而不是日後加協作才出現的問題。

問題在於**這個判斷該住在哪**。三個層次都想要它：

- **auth library**：它已經知道 session 與 user，順手做掉最省事。
- **command 層**：[ADR-0007](./0007-document-as-single-authority.md) 說它是不變式的家，看起來授權也該在這裡。
- **application layer**：夾在中間，什麼都不是。

選錯的代價不對稱。放進 auth library，等於讓一個**可替換的 infrastructure 元件**成為領域授權的真理來源 —— 換 library、換 session model、或從 owner 擴充到 members 時，領域規則要跟著搬家。放進 command 層，則每條 command 的簽名要多一個 `userId`，而 [規格書 §11](../../.scratch/scenephonie-mvp/spec.md) 的不變式測試從此得先造一個 user 才跑得起來 —— 但那些不變式答的是「這個操作對**這份 doc** 合不合法」，是**與人無關**的問題。

## Considered Options

**授權由 auth library / middleware 負責。** 否決。它把 infrastructure 抬成領域真理來源，而這個系統的 provider identity（Google 的 `sub`）本來就被刻意隔離在 library 的 `account` 層之外。讓同一個元件回頭決定領域權限，等於把剛關上的門從另一側打開。

**授權寫進 domain command。** 否決。command 的職責是不變式，那是與 identity 無關的判斷；把 `userId` 塞進去會讓每條 command 帶一個與領域無關的參數，並讓 §11 的測試綁上使用者。

**授權在 application layer 完成，command 只吃已授權的 context。** 採用。

## 決策

責任分工固定成四層，**每一層只回答一個問題**：

| 層 | 回答的問題 |
|---|---|
| Authentication | 你是誰 |
| Authorization | 你能操作哪個 project |
| Domain command | 這個操作是否合法（與人無關） |
| Document | canonical state |

不變式 H 說的是**責任歸屬**，不是時序 —— 措辭刻意避開「授權必須發生在 command 之前」。時序是實作細節，一換架構就變成假規則；責任歸屬跟得住重構。

**具體形狀**（可替換，不寫進不變式）：一個 gate 取得已授權的 project handle，write use case 只接受那個 handle、不接受 `userId`。這讓「沒授權就呼叫 command」**在型別上表示不出來**，而不是靠每個 handler 記得檢查 —— 與[票券 09](../../.scratch/scenephonie-mvp/issues/09-nested-subscenes.md) 否決 `depth` 旗標、[票券 17](../../.scratch/scenephonie-mvp/issues/17-continuous-action-across-spaces.md) 否決指標是同一招：靠慣例維持的東西會說謊。

## 後果

**① identity chain 是 `Scenephonie UserId → users.id → projects.owner_id`。** domain 只認自己的 `UserId`（`usr_` + nanoid，比照 `sc_`／`gr_`），provider identity 留在 auth library 的 `account` 層，**domain 永不讀 `account`** —— 這是一條 grep 就能驗的規則。原則：**infrastructure 不應迫使 domain identity 改變。**

**② 授權主體不只有 `UserId`。** [票券 12](../../.scratch/scenephonie-mvp/issues/12-share-link-live-or-frozen.md) 的 `/s/<token>` 唯讀分享頁沒有帳號，卻仍要決定能看哪個 project。它是**另一種 authorization subject**（`ShareViewer`），而非第二套授權機制 —— 否則會長出平行真理，正是本條要防的。寫路徑不接受它。具體型別留到分享連結實作（[規格書 §13.2](../../.scratch/scenephonie-mvp/spec.md) 階段 8）。

**③ 所有 authentication entry point 都收斂進同一條 pipeline。** Google OAuth 與訪客體驗入口都取得正常的 `UserId`，之後走完全相同的 `User → ownership → Authorization → Command`。**domain 不知道誰是訪客** —— 訪客體驗因此不需要任何授權例外，這是保持一致性的方式，不是為 demo 犧牲一致性。

**④ `ownerId` 是 v1 authorization 的最小掛點，不是永久模型。** 未來演進成 members／invitations／organization 時，是在它之上加東西，不必否定它。

**⑤ 採用 auth library 的 plugin 時，只採用其資料模型，不採用其授權判斷。** 2026-09-01，[票券 30](../../.scratch/scenephonie-mvp/issues/30-better-auth-evaluation.md) 補記。選定的 Better Auth 其 `organization` plugin 自帶完整 RBAC（`createAccessControl` / `hasPermission` / `organizationRole` / `session.activeOrganizationId`），官方文件自述「the plugin enforces all role-based access control checks」—— **那正是上面〈Considered Options〉第一條否決的形狀**。plugin 的存在不改變那個裁決，只是把誘惑放到手邊。禁止清單：`createAccessControl`、`hasPermission`、`organizationRole` 的 dynamic AC，以及**以 `session.activeOrganizationId` 作為授權依據**（它是 UI 狀態不是權限 —— 授權主體必須從 request 的 project 參數推導，否則使用者換 tab 就換權限）。可採用的是它的**資料表**：`member(organizationId, userId, role)` 正是 ④ 所說「在 `ownerId` 之上加的東西」，把 `role` 當領域事實讀進 application layer gate 即可。這條與 ① 的「domain 永不讀 `account`」同屬**一條 grep 就能驗**的邊界 —— 因為靠慣例維持的東西會說謊。

---

> **範圍註記（2026-09-01，[票券 25](../../.scratch/scenephonie-mvp/issues/25-deployment-and-hosting.md)）**：本 ADR 處理的是 **identity** —— 你是誰，以及 provider identity 不得洩進 domain。上面的 §⑤ 出現後，同一條規則第三次以不同面貌出現（Supabase 的 RLS 與 Auth），而 RLS 根本不屬於認證，本 ADR 的標題框不住它。該規則因此升格為 **[ADR-0012 基礎設施提供機制，不提供授權真理](./0012-infrastructure-provides-mechanism-not-authority.md)（不變式 I）**，處理更廣的 **authorization authority**。§① 與 §⑤ 保留在此（它們仍是本 ADR 推論的一部分），但其一般化形式與可 grep 清單以 ADR-0012 為準。
