# 基礎設施提供機制，不提供授權真理

[票券 25](../../.scratch/scenephonie-mvp/issues/25-deployment-and-hosting.md) 決定用 Supabase 託管 Postgres。Supabase 免費附送 Auth 與 RLS，而我們只打算用它的 Postgres —— 這需要一條明文界線，否則「反正它就在那裡而且免費」會慢慢把授權判斷搬進資料庫。

但寫這條界線時浮出一件事：**同一個誘惑在本效力已經出現三次，對象各不相同。**

| # | 誘惑 | 來源 |
|---|---|---|
| 1 | 讓 auth library 的 `account` 表成為 domain identity／authority | [ADR-0011](./0011-authentication-identity-is-not-domain-authority.md) §① |
| 2 | 讓 Better Auth `organization` plugin 的 `createAccessControl` / `hasPermission` / `session.activeOrganizationId` 成為授權依據 | [票券 30](../../.scratch/scenephonie-mvp/issues/30-better-auth-evaluation.md) |
| 3 | 讓 Supabase RLS／Supabase Auth 成為授權依據 | [票券 25](../../.scratch/scenephonie-mvp/issues/25-deployment-and-hosting.md) |

三者表面不同 —— 一個是 library、一個是 plugin、一個是資料庫廠商 —— 但背後是同一條規則。而 ADR-0011 的標題（「認證身分不直接授予領域權限」）**框不住第 3 條**：RLS 根本不是認證。所以需要的不是給 ADR-0011 再加一條後果，而是一條更一般的規則。

> **不變式 I：任何由 infrastructure、auth library、plugin 或 database provider 提供的 access-control mechanism，都不得成為 Scenephonie domain/application authorization 的權威來源。**

## Considered Options

**每次遇到就在相關 ADR 補一條後果。** 否決。已經試過兩次（ADR-0011 的 §① 與 §⑤），第三次就發現規則散落在以「認證」為題的文件裡，而第 3 條根本不屬於認證。規則的**範圍**已經超出它現在的住所。

**寫成技術禁令：「禁止使用 RLS／Supabase Auth／access-control library」。** 否決。那是 technology prohibition，不是 architecture decision —— 它把未來的技術選擇不必要地鎖死。RLS 作為 defense-in-depth 是完全合法的用法，禁掉它等於為了防一種誤用而放棄一種正當防護。

**寫成 authority invariant ＋ 具名的可 grep 清單。** 採用。它區分的是**用途**而非**技術**。

## 決策

核心區分是：

```text
可以使用 mechanism   ≠   可以把它當 authority
```

**判準是一個可否證的問句**（同 [ADR-0010](./0010-editor-representation-is-not-output-preview.md) 追求可否證性的理由）：

> **若這個 mechanism 說「可以」而 application layer gate 說「不可以」，誰贏？**
>
> - **gate 贏** → 該 mechanism 是 defense-in-depth，**合法**。
> - **mechanism 贏，或根本沒有 gate** → 它已經是真理來源，**違反不變式 I**。

所以未來若真的採用 RLS，必須先回答這個問句。答「它是額外的一層防護，policy 寫錯不會讓未授權的人通過 gate」可以；答「gate 不必查 ownership，RLS 會擋掉」不行。

**這條與 ADR-0011 的分工**：ADR-0011 處理 **identity**（你是誰，以及 provider identity 不得洩進 domain）；本 ADR 處理 **authorization authority**（誰有資格判定你能做什麼）。兩個概念值得分開，因為第三個案例證明了它們的邊界不重合。

## 後果

**① 具名的可 grep 警戒清單。** 沿用 ADR-0011 自己的判準 —— 靠慣例維持的東西會說謊，所以邊界要能被機械檢查：

| 符號／能力 | 不得成為 |
|---|---|
| auth library 的 `account` 表 | domain identity／authority（ADR-0011 §①，domain 永不讀它） |
| `createAccessControl`、`hasPermission`、`organizationRole` 的 dynamic AC、`session.activeOrganizationId` | domain authorization authority（ADR-0011 §⑤） |
| Supabase RLS policy、Supabase Auth | domain authorization authority |

清單**會隨新廠商增長**，這是預期行為 —— 它記錄的是「已知擺在手邊的誘惑」，不是窮舉。

**② 可採用的一律是資料模型與機制本身。** Better Auth 的 `member(organizationId, userId, role)` 可以採用（把 `role` 當領域事實讀進 gate）；RLS 可以作為 defense-in-depth；Supabase Storage 可以當檔案儲存。被禁止的只有**讓它們代替 gate 做判斷**。

**③ v1 的具體形態。** Supabase 僅作為 PostgreSQL 託管服務；Supabase Auth／RLS／Storage／Realtime 皆不參與 domain/application 的權威判定。這不是「永遠不用」，而是「v1 不讓它們成為核心架構的 authority」。

**④ 這條規則的成本是它必須被重複執行。** 每次引入新的 infrastructure 元件（新 plugin、新託管服務、新 SaaS），都要問一次第三節的判準問句。這是有成本的，但它替換掉的是一個更貴的東西：等到授權邏輯已經長在三個地方之後，再回頭找哪一個才是真的。
