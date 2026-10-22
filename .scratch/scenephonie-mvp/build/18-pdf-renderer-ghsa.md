# 18 — PDF Renderer（GHSA 格式）

**What to build:** 消費一筆交付、產出可投稿的 PDF（驗的是輸出品質）。**水準線：拿去參賽會被接受，不追求排版精美。** Puppeteer/Playwright ＋ `@sparticuz/chromium`（CJK 排版精度最高、`@page` 對應格式規範、`break-inside: avoid` 做分頁控制、換格式 ＝ 換 CSS 模板）。**v1 只做一種格式：GHSA 優良電影劇本獎**（與 BAMID 附件那份 4 頁範本實質等同）。頁面設定（§9.3）：直式橫書繁中 **12 級字**（GHSA 明文硬性）；A4；「每頁行數」**不存在這個規定**；字型／行高／邊界由模板選定（建議初值：邊界四邊 2 cm、行高 1.5 倍、思源／Noto）；不得沿用 TNUA／TFC／編劇高雄的數字冒充 GHSA。各元素印法（§9.4）：場次標題 `1. 內景 阿強家客廳 夜`（半形句點、不含人物欄、不加 △、不粗體、不縮排）；子場次標題 `5.1　內景 醫院走廊 日`（無尾點、改用全形空白、不縮排、不加「插入」前綴）；動作純段落無符號；對白**行內式** `人物名：對白內容`（全形冒號、不換行、不置中、不縮排，整段對白與前後動作各空一行）；發聲方式 `小明（V.O.）：…`；插入畫面渲染 `INS`；折返 `回到　公寓客廳`（印**地點顯示名、不印場次號**）；交叉場次**先建立、再宣告、再交錯**（兩地各自完整場次標題 → `以下對剪` → 交錯片段，歸屬標記印地點名不印場次號，顯示名相同時補印區別欄位）；登場人物**匯出選項、預設關**；群演不進 PDF；頁碼置中、**跨區段連續**；時間戳每頁靠左小字、**匯出選項、預設開**、可關；浮水印掛 `@page`、**文字必須是可輸入參數**（含屆別）。對白排版變體 v1 選**行內式**（§9.5：三屆連續存在、投稿風險零、與資料模型自然對應）；置中分行式 ＝ 換一個 CSS 模板（不動資料模型）。折返標記推導規則全部從結構讀出（§9.4 表），**空區塊不算內容**。「以下對剪」「回到」「INS」「placeholder」都不進資料模型（約束 2）。**頁尾時間戳 ＝ 交付的建立時間**，不是渲染當下的 now。PDF byte-for-byte determinism **不是** domain invariant。硬邊界：**Cloudflare Workers 純執行模式不可行**（每個 Worker 僅 10 MiB）。§9.8 的參數化維度先留成模板結構，不實作第二種格式。

**Blocked by:** 17

**Status:** in-review

- [x] 一筆 fixture 交付渲染成 PDF，版面對齊 GHSA 4 頁範本（可被投稿接受）
- [x] 場次／子場次標題、行內式對白、發聲方式、INS、折返、對剪印法都符合 §9.4
- [x] 頁碼跨區段連續；時間戳 ＝ 交付建立時間（重新渲染印出同樣的字）
- [x] 浮水印文字是可輸入參數；登場人物／時間戳是匯出選項（預設關／開）
- [x] 折返標記依結構推導，兩子場次相鄰不印，空區塊不算內容
- [x] 渲染在 `@sparticuz/chromium` 環境跑得動；CJK 折行與避頭尾正確
- [x] CSS 模板結構按 §9.8 維度組織，換格式 ＝ 換模板

## Comments

**2026-10-22 來自票券 17（交付）**：渲染器的輸入是 `loadDelivery` 讀回的 `DeliveryPayload`（`packages/schema/src/delivery.ts`），
不是 live doc。payload 已經算好場次號、草稿／殘缺對剪的排除、折返（`returnTo`，帶地點顯示名）、對剪宣告（`intercut`）與
片段歸屬（`fragment` 的 `location`＋`disambiguateBy`）—— 這裡只決定印成什麼字，**不准重算**（不變式 E）。
頁尾時間戳讀 `Delivery.createdAt`。元素型別與 `DELIVERY_PAYLOAD_VERSION` 還沒從 `@scenephonie/schema` 出口，本票是第一個讀者，要用時再開。

**待本票裁定（使用者 2026-10-22 交辦）**：雜景且地點留空的場次，payload 的 `locations` 是空陣列。場次表那一格印「參照敘述」，
但 **PDF 場次標題要印什麼**規格沒寫 —— 純印法，不動 payload 形狀。

**2026-10-22 實作（PR 待開）。** 落點：

- `apps/web/src/pdf/render-html.ts`：交付 → HTML。只讀 payload、只決定印成什麼字（不變式 E）；「回到」「以下對剪」「（INS）」只住在這裡。
  不認得的 `payload.version` 大聲失敗。
- `apps/web/src/pdf/format.ts`：§9.8 的維度先長成 `PrintFormat`，只有 `GHSA` 一組值（12pt、A4、邊界 2 cm、行高 1.5、
  Noto Sans TC、標題前空兩行、元素間空一行、連續對白不空行）。
- `apps/web/src/pdf/print-pdf.ts`：puppeteer-core 一趟 `page.pdf()`。本機找裝好的 Chrome，Vercel／Lambda 用
  `@sparticuz/chromium`（`CHROMIUM_EXECUTABLE_PATH` 可覆寫）。**字型不賭執行環境**：頁面掛在假 origin，印表端從
  `public/fonts` 送出票券 29 的 self-host subset；除此之外一律不准出網。
- 頁碼 `@bottom-center { counter(page) }`、時間戳 `@bottom-left`（交付的 `createdAt`，台北時間 `2026-10-22 14:30`）——
  `@page` 邊界盒，天然跨區段連續。浮水印是 `position: fixed` 的一層（Chromium 的 `@page` 不畫背景圖）。
- 端點 `GET …/deliveries/[deliveryId]/pdf?watermark=&characters=&timestamp=`：gate → `loadDelivery` → 印。匯出選項是
  **渲染參數不是交付內容**，走 query（`pdf/export-options.ts` 編解碼同一份）。
- 匯出按鈕（`editor/export-pdf.tsx`）：先存檔（`useAutosave().flush()` 回報是否落地）→ `createDeliveryAction` → 印；
  印壞了「再印一次」用同一筆交付。
- 驗證：`print-pdf.test.ts` 在本機 Chrome 與 AWS Lambda `nodejs:22`（AL2023）容器＋`@sparticuz/chromium` 都跑過；
  `next build` 的追蹤清單確認帶上 `bin/*.br` 與字型（`outputFileTracingIncludes` 的鍵是 picomatch glob，
  寫 `[projectId]` 會被當字元類別而永遠對不上）。

裁定（使用者 2026-10-22）：**雜景留空地點 → 標題省略那一欄（`3. 雜景 夜`），折返與片段標記補「雜景」**（`回到　雜景`）。

實作時自定、待使用者驗收時確認：
- 插入畫面印 `（INS）桌上的信。`（台灣慣例 `△（INS）` 去掉 △）。
- 登場人物打開時印在標題下一行 `人物：男子、阿強`（這一場的顯示名），不塞進標題列。
- 對白沒有說話者時只印對白本身，不補名字。
- 片段標記補印區別欄位的樣子：`阿強家客廳（夜）`、`阿強家客廳（內景 夜）`。

留給後續：§9.8 還沒長成欄位的維度（中英文字型分開、頁碼位置、場次編號攤平、投稿包裝頁）等第二種格式出現時再加；
標題頁／大綱／人物介紹三個區段歸票 21（`section + section { break-before: page }` 已經在模板裡）。

**2026-10-22 驗收第一輪（使用者）**：

- 場標**粗體**、場標下一行直接接內文（不空行）—— 照範本實物，推翻 §9.4 原本「不粗體」的圖像判讀（`format.ts` 的
  `heading.bold`、`heading.linesAfter`）。「夜」前是半形空白（粗體造成的錯覺），不改。
- 登場人物照 TNUA 接在場標列最後、不加「人物：」：`1. 內景 阿強家客廳 夜 男子、阿強`。
- 字型變成匯出選項：**楷體（預設）／黑體**。標楷體、微軟正黑體、蘋方都是授權字型，不能放上伺服器嵌進 PDF；
  楷體用**全字庫正楷體**（數位發展部，政府資料開放授權條款第 1 版，`public/fonts/tw-kai/LICENSE.md` 註明出處），
  黑體用既有的 Noto Sans TC。楷體只管中文與全形符號，半形英數落到 Noto Sans TC（TW-Kai 的 ASCII 是全形寬等寬字，
  `V.O.` 會被拉開）。產物 7.5 MiB，由 `scripts/fonts/build-twkai-subset.py` 沿用票 29 的切分表產生。
- 手動離線時存檔一直重試 → 另開 [65](./65-autosave-retry-backoff.md)。
