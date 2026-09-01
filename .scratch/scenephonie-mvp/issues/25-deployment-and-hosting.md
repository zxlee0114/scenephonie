# 部署與資料庫託管

Type: grilling
Status: resolved
Blocked by:

## Question

從地圖迷霧「部署與資料庫託管」畢業（2026-08-31，[票券 06](./06-mvp-spec-writeup.md) 寫規格書時）。

### 為什麼現在才夠銳利

[票券 05](./05-pdf-export-tech.md) 給了一條**硬邊界條件**，選項因此收斂到可以問了：

> PDF 匯出的首選方案（Puppeteer ＋ `@sparticuz/chromium`）在 **Vercel／AWS Lambda 可行**（未壓縮 250 MB 足夠），
> 但在 **Cloudflare Workers 純執行模式不可行**（每個 Worker 僅 10 MiB）。

**這是技術路徑反向約束了部署平台選擇。**

### 要回答

1. **應用程式跑在哪？** Vercel／AWS／自架 VPS／其他？
2. **PostgreSQL 託管在哪？** Neon／Supabase／RDS／自架？判準包含：與應用同區域（doc 是幾百 KB 的 jsonb，每次自動存檔整列重寫，來回延遲會直接被編劇感覺到）、備份與 PITR、成本。
3. **若傾向 Cloudflare**，PDF 匯出要拆成獨立子服務（跑在 Vercel／Lambda），還是改用 Cloudflare Browser Rendering API？⚠️ 後者是**另一套產品與計費模型，[票券 05](./05-pdf-export-tech.md) 未實測其字型行為** —— 選它就得先實測，那會是一張 prototype 票。
4. **儲存體積的預估要不要影響選擇**：自動備份 append-only、v1 全部保留，重度連續寫作一天約 4～5 筆、一年數十 MB／劇本（[票券 04](./04-screenplay-storage-model.md) Q7(e)）。交付也全部保留。v1 單人規模吃得下，但託管方案的儲存計價值得先看一眼。

### 不在這張票內

- **認證** —— [票券 24](./24-auth-and-project-owner.md)。但兩張票的答案會互相限制（多數託管平台自帶認證方案），先做完的那張要把結論餵給另一張。
- **PDF 技術選型** —— [票券 05](./05-pdf-export-tech.md) 已定，本票只決定它跑在哪裡。

### 它擋什麼

**擋部署，不擋開工。** [規格書](../spec.md) §13.2 的階段 0–2 完全不需要知道這張票的答案。

---

## Comments

### 2026-09-01 — 來自[票券 30](./30-better-auth-evaluation.md)的回饋：session model 對部署的約束

票券 30 已 resolve，選定 **Better Auth `~1.7.x`**，session model 裁決為 **DB session（存我們自己的 Postgres）＋ cookie cache**。由此推出的部署約束：

**硬約束（只有一條）**

1. **跑 route handler 的地方必須連得到 Postgres。** session 的完整驗證（`auth.api.getSession()`）要查 DB，而 raw TCP socket 在 edge runtime 普遍不可用。
   ➡️ **排除「整個 app 跑在 edge runtime」的部署形態。** 若本票想保留 edge 選項，就得改用 HTTP-based 的 Postgres driver（如 Neon serverless driver）—— **那會讓 driver 選擇升格成本票的 blocking 決策**。

**已被刻意消除的約束**

票券 30 同時裁決 **middleware 只做 optimistic redirect**（`getCookieCache()`，已簽章驗證、無 DB 往返、Edge 可跑），真正的授權在 page／route handler 的 application layer gate 完成（[ADR-0011](../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md) 指定的位置）。

➡️ **效果是 middleware 層對部署形態幾乎沒有要求。** 本票因此可以在**長駐 Node server** 與 **serverless Node function** 之間自由選，只有 edge-only 被排除 —— 而那條線本來就已經被[票券 05](./05-pdf-export-tech.md) 的 Puppeteer 邊界畫掉了（Cloudflare Workers 10 MiB）。**認證沒有再收窄票券 25 的選項空間。**

**次要事實（版本，非平台）**

- 若日後想在 middleware 做完整驗證：需 Next.js ≥ 15.2.0 並設 `runtime: "nodejs"`；Next.js 16+ 檔名為 `proxy.ts`、函式名為 `proxy`。這綁的是 Next.js 版本與平台對 Node runtime middleware 的支援度，**在上面的建議形狀下用不到**。
- 每請求成本：cookie cache 命中時 auth 貢獻 **0 次** DB 往返，過期時 1 次；主要成本落在我們自己的 ownership 查詢上。
- 跨區低延遲若成為問題，Better Auth 支援 secondary storage（Redis）與 `deferSessionRefresh`（read replica）—— **v1 之後的優化，不進本票**。

證據與來源見[研究報告](../research/30-better-auth-evaluation.md) §3、§〈回饋給票券 25〉。

## Answer

**Vercel Hobby（`hnd1` 東京）＋ Supabase Free（東京）只當 Postgres 用，Supavisor transaction mode 連線；六條 tripwire 定義何時升級。**

### 0. 目的地改寫了判準（本票最重要的一句）

原問法預設要選一個「能對外營運的部署」。但 v1 的成功標準是**作品集 ＋ 封閉測試**，不是正式營運：讓身邊編劇朋友實際操作、收回饋、驗證工作流程，而**不讓他們把正式創作流程建立在平台上**。

這條前提把可用性從**產品需求**降級成**展示需求**，於是免費層的缺點（暫停、無 PITR、60 秒上限）從「不可接受的風險」變成**可接受且被寫下來的取捨**。核心原則：

> **先用最便宜、最少 ops 的方案把 MVP 跑起來；只有真實需求觸發 tripwire，才增加成本或架構複雜度。**

最稀缺的資源是**開發時間與注意力**，不是基礎設施控制權 —— 自架 VPS 因此出局（不是因為它不好，是因為它跟階段 2 的六個 bug 家族搶同一份注意力）。

### 1. 應用程式：Vercel Hobby，region `hnd1`（東京）

**查證更正**：Vercel Limits 表的 Hobby ＝「Single region」是**只能一個**、不是**只能預設那個**；新專案預設 `iad1`，可在 Settings 或 `vercel.json` 的 `regions` 改成任一 region。（先前「`hnd1` 只開放 Pro」的說法來自 regional **pricing** 文件，那是用量計費只對 Pro 適用，不是 region 可用性。）

選 Vercel 的理由依序是：Next.js 部署路徑最直接、零成本、幾乎不增加 ops、升 Pro 的遷移成本極低、且 **Vercel ＋ Next.js 是面試官不必額外理解的組合** —— 作品集情境下，基礎設施不該偷走解釋編輯器與領域模型的時間。

⚠️ **Hobby 禁止商業使用。** 封測不收費即合規；**向任何人收費就觸發升級**（tripwire 1）。

### 2. 資料庫：Supabase Free，東京（`ap-northeast-1`）

**選它的理由不是延遲。** 本票原文寫「來回延遲會直接被編劇感覺到」，那句話**沒有實測支持**，不足以當主要判準（且 §6.7 的自動存檔是 debounce 後的背景寫入，編劇不等它）。真正的理由是：

> 對作品集／封測階段而言，**開發體驗、可觀測性與除錯便利性**，比那幾十毫秒的跨區延遲更有價值。

具體地，[§6.7](../spec.md) 明說「要救稿時從 `psql` 手動撈」—— Supabase 的 dashboard 與 SQL editor 直接服務這條路徑。**東京 region 是加分，不是唯一依據。** 若日後實測證明「開啟劇本」真的被 DB latency 明顯影響，再重新評估不遲。

**落選的 Neon**：東亞最近只到新加坡（官方表示近期無新增 Tokyo 計畫）。它的 scale-to-zero 自動喚醒（不需人工復原）優於 Supabase Free 的 7 天暫停，其 HTTP driver 也能消掉連線建立成本 —— 但那條優勢只在「保留 Edge 選項」時才有意義，而第 4 節已排除 edge-only。

**Free 層的兩條已知代價與其解**：

| 代價 | 處理 |
|---|---|
| 7 天無活動即**暫停**，需**手動**從 dashboard 復原（逾 90 天可能被刪） | 每日 cron ping（Vercel Hobby 允許 2 個 cron／每日一次，剛好夠）。⚠️ 這是封測的真實故障模式：朋友兩週後想起要試，看到的是壞掉的產品，而修好它需要你在場 |
| 無 PITR、無每日備份 | 暫時接受。§6.7 的 application-level before-image 已覆蓋「編劇誤刪內容」；DB-level disaster recovery 延後到 tripwire 4 |

### 3. Supabase 的能力邊界（明文約束，並升格成 [ADR-0012](../../../docs/adr/0012-infrastructure-provides-mechanism-not-authority.md)）

> **v1 使用 Supabase 僅作為 PostgreSQL 託管服務。Supabase Auth、RLS、Storage、Realtime 不作為 Scenephonie 核心 domain/application 能力的權威來源。**

這不是「永遠不用 Supabase 其他服務」，而是「**v1 不讓這些服務成為核心架構的 authority**」。Auth 與 RLS 這條界線尤其要明確：票券 24 已裁決 authorization 的真理來源在 application/domain（不變式 H），不能因為 Supabase 免費附送 Auth 或 RLS，就讓 infrastructure 反過來決定 domain 的授權模型。

這個誘惑在本效力已出現**三次**（auth library 的 `account`、Better Auth `organization` plugin 的 access control、Supabase 的 RLS／Auth），因此升格成 **ADR-0012（不變式 I）**，不再逐次補註記。

### 4. PDF 匯出：不預先拆服務，階段 7 先實測

**Vercel Hobby 的 function 上限是 60 秒**，這是 Free 層唯一可能真的擋住功能的限制。估計一次匯出落在 10–20 秒（Chromium 冷啟 2–5 秒 ＋ CJK 字型載入 ＋ 渲染），但那是估計不是實測。

裁決是 **先測，再拆**：[階段 7](../spec.md) 開頭用一份**真實長度**的劇本做 end-to-end benchmark（cold start／Chromium 啟動／CJK font loading／document rendering／PDF generation）。**逼近上限就升 Pro，而不是拆成 worker／queue／service boundary** —— 拆服務要付的跨服務認證與錯誤處理成本，遠高於升級 Pro。這也守住〈一條路走通，但不堵死岔路〉。

### 5. 連線模型（[票券 30](./30-better-auth-evaluation.md) 回饋 ＋ 一條硬事實）

**硬事實**：Supabase 的 direct connection（`db.<ref>.supabase.co`）**是 IPv6-only（所有方案皆然），而 Vercel 不支援 IPv6。** 所以 **Supavisor pooler 不是優化選項，是這個組合能不能連上的前提**。Shared Pooler 在所有方案（含 Free）都是 IPv4。

| 用途 | 連法 | 環境變數 |
|---|---|---|
| **Runtime**（Vercel function） | Supavisor **transaction mode，port 6543**；`postgres(url, { prepare: false })` | `DATABASE_URL` |
| **Migration**（`drizzle-kit migrate`，從本機或 CI） | direct connection，或 pooler 的 **session mode，port 5432** | `DIRECT_URL` |

transaction mode 不支援 named prepared statements（Supavisor 會在語句之間重新指派連線），故 Drizzle ＋ postgres.js 必須關掉 `prepare`。

**它沒有撞到任何 domain invariant，而且不是巧合**：§6.7 的並行控制走 **`doc_seq` optimistic concurrency**（不是 advisory lock），備份與 doc update 的原子性是**單一 transaction**（transaction mode 完整支援）。transaction mode 真正拿走的是**跨語句的 session 狀態**（advisory lock、`LISTEN/NOTIFY`、session 變數）—— 規格書一項都沒用到。當初為了避免鎖而選 optimistic concurrency，順帶讓這個部署形態可行。

> ⚠️ **架構邊界（不是功能禁令）**：若未來引入依賴 PostgreSQL session state 的能力（advisory lock、`LISTEN/NOTIFY`、session-scoped state），**必須重新檢視此 transaction-mode 連線模型；不能假設它只是一般 query 的增量功能。** 這與硬性約束 3（不得堵死協作）不衝突 —— Yjs 的訊號層走 WebSocket，不走 Postgres 通知。

**票券 30 的部署回饋亦已收下**：middleware 只做 optimistic redirect（`getCookieCache()`，無 DB 往返、Edge 可跑），真正的授權在 route handler 的 application layer gate。runtime 約束因此收斂成一條 —— **跑 route handler 的地方要連得到 Postgres（raw TCP）**。Vercel 的 Node.js function 合格；**只有 edge-only 部署形態出局**。

### 6. 訪客與 demo 資料的 lifecycle：TTL 清理

票券 24 的訪客入口形狀是 **ephemeral user ＋ clone 一份 demo project**，意味著**每個陌生訪客都會長出一份完整的劇本 doc（幾百 KB）**，且成長由陌生人驅動、無上限 —— 在 500 MB 的 Free 層上，這是真實的容量風險，而作品集的用途恰恰是**要給人看**（面試官會點進去試）。

**裁決**：未 link 到 Google 的 anonymous user，**最後活動後超過固定 TTL（初始政策 7 天）即清理，連帶清理其 demo project**。掛點是現成的 —— [§6.2](../spec.md) 的 `users.is_demo` 已標記為 infrastructure metadata、不進 domain model。

理由不只是省錢：**一個永遠不清理的 ephemeral user 表，等於把「臨時」寫成了「永久」**，那是概念上的不誠實。

⚠️ **不阻塞於 [票券 30](./30-better-auth-evaluation.md) 的 spike #2**（anonymous → Google 的就地升級能否保住同一個 `usr_...`）：TTL 這條 domain policy 在兩種結果下都成立，只是「被 link 掉的」與「過期的」如何區分屬實作細節。

### 7. 每日排程（一個 cron，兩件事）

1. **cron ping** —— 讓 Supabase Free 不因無活動而暫停
2. **anonymous／demo TTL cleanup** —— 第 6 節

**`pg_dump` off-site 備份暫不納入**：它已超出「作品集 ＋ 封測」的成功標準，而 §6.7 的 before-image 對本階段的主要資料遺失情境已有一定保護。它掛在 tripwire 4 之後 —— 進入真實創作階段，才做 `pg_dump`／off-site backup，並考慮 Supabase Pro ／ PITR。

### 8. 六條 tripwire（升級條件，不是技術門檻）

任何一條成立即升級，不再重新討論：

| | 條件 | 動作 |
|---|---|---|
| 1 | **開始向任何人收費** | → Vercel Pro（Hobby 禁止商業使用；這條是合規，不是效能） |
| 2 | **PDF 匯出實測逼近 Hobby 上限** | → Vercel Pro |
| 3 | **DB 容量接近 Free tier 上限** | → Supabase Pro |
| 4 | **開始承載「不能弄丟」的真實創作** | → Supabase Pro（PITR ＋ 每日備份）＋ 啟用 `pg_dump` |
| 5 | **Free tier 的限制造成反覆封測中斷** | → Supabase Pro |
| 6 | **ephemeral data 不再是可忽略的噪音，而開始產生實際成本、管理負擔或容量風險** | → 重新處理 visitor lifecycle／infra |

**刻意不寫具體數字**（如「> 100 個 demo project」）：可變的數字不承載判準 —— 同 [ADR-0002](../../../docs/adr/0002-scene-id-and-derived-scene-numbers.md)「可變的顯示值不承載身分」的形狀。寫死數字只會讓未來為了 99 與 101 的差異重新爭論。

**第 4 條是最重要的一條**，因為它標記的是**產品階段的改變** —— 從「朋友試用」變成「有人把真實創作交給它」，這時資料保護就不再是作品集階段可接受的 trade-off。它是主觀判定，因此有一條配套義務：

> **這句話要對使用者講出來。** 登入後或首次使用時明說：封測階段、請勿存放唯一一份稿件。不講而預設他們知道，是把風險轉嫁給不知情的人。

### 9. 架構邊界

```text
                Vercel Hobby
                   hnd1
                     │  Node.js runtime
                     ▼
             Next.js Application
                     │
           ┌─────────┴─────────┐
           │                   │
      Domain / Auth        PDF Export
      Application         （先同服務）
           │
           ▼  Supavisor transaction mode :6543
        Supabase Postgres（東京，僅作託管）
           ├── canonical doc
           ├── users（Better Auth schema）
           ├── entities
           └── before-image
```

### 10. 不出 ADR 的部分

部署姿態（Hobby ＋ Free ＋ 六條 tripwire）**不另開 ADR**，它住在本票 Answer ＋ [規格書 §13.1](../spec.md) ＋ §14.2。理由用 ADR 自己的三條門檻檢查：它**不難反轉** —— tripwire 清單本身就是反轉計畫，那正是它的設計目的。為可反轉的 operational choice 開 ADR，反而容易把暫時性的部署選擇誤標成長期架構不變式。

**唯一升格成 ADR 的是第 3 節的 authority 邊界** —— 那條難反轉、跨三個廠商、且是真實取捨的結果。
