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
