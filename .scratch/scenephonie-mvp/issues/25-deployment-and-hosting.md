# 部署與資料庫託管

Type: grilling
Status: open
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
