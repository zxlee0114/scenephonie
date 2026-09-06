import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * 關聯式表只裝「本來就不在 doc 裡的東西」（ADR-0007、§6.2）——
 * doc（ProseMirror JSON）是唯一權威，這些欄位永遠不是它的第二份副本。
 *
 * ⚠️ 這裡沒有 `scenes` 表，而且日後也不會有：場次「存在」就是它在那棵樹上。
 */

/* ────────────────────────────────────────────────────────────────────────────
 * auth library 的隨附表（票券 06）
 *
 * **schema 主權在我們**（票券 30 §2）：Better Auth 的 CLI 對 Drizzle 只做 `generate`
 * ——它吐出 TypeScript，不碰資料庫；migration 一律由 `drizzle-kit` 產生，進我們自己的鏈，
 * 沒有第二套 migration 系統。下面四張表逐字取自 `auth@1.7.2 generate` 的輸出（只刪掉我們
 * 用不到的 `relations()`），**升版流程**：重跑 generate 到暫存檔 → diff → 人工併進來 →
 * `drizzle-kit generate`。第三步是人工的，也應該是人工的。
 *
 * ⚠️ **`accounts` 是 provider identity（Google `sub`）的家，domain 永不讀它**
 * （不變式 H／I、ADR-0011 §①、ADR-0012）。這條由 `src/authorization/authority-boundary.test.ts`
 * 一條 grep 守著 —— 靠慣例維持的東西會說謊。
 *
 * ⚠️ 表名是複數（`users`／`sessions`…），**auth 設定的 `modelName` 與這裡必須同時改**，
 * 否則 Drizzle adapter 在執行期找不到表。
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 一個人一列。**`id` 的產生規則由我們控制** —— `usr_` ＋ nanoid，比照 `sc_`／`gr_`
 * （ADR-0011 §①）。這正是「不做影子表」能成立的前提：換 auth library 時
 * `projects.owner_id` 一個字不動。
 *
 * identity chain：`Scenephonie UserId → users.id → projects.owner_id`。
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),

  /**
   * **infrastructure／lifecycle metadata，不是 domain model 的一部分**（§6.2、票券 24 §6）。
   *
   * 它回答的是「這一列該不該被 TTL 清掉」，**不是**「這個人能做什麼」——
   * 授權從頭到尾只看 `projects.owner_id`，訪客與受邀者走的是同一條路（ADR-0011 §③）。
   * 所以這個欄位只有兩個消費者：`auth/auth.ts`（訪客入口把它設成 true）與
   * `guest/guest-ttl.ts`（清理任務），`src/authorization/authority-boundary.test.ts` 守著
   * 它不外流到 domain、授權或 persistence。
   *
   * ⚠️ 欄名是 `is_demo`（規格 §6.2 的名字），TS 這一側叫 `isDemo`；Better Auth 的
   * `anonymous` plugin 自己那個欄位叫 `isAnonymous`，在 `auth/auth.ts` 用 plugin 的
   * `schema` 選項映到這裡 —— **同一件事只有一個名字**，翻譯發生在邊界上。
   */
  isDemo: boolean("is_demo").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_userId_idx").on(table.userId)],
);

/**
 * provider identity 的隔離位置（Google `sub` 落在 `account_id`，1.7.0 起唯一鍵是
 * `(issuer, account_id)`）。**domain 永不讀這張表** —— 它只認 `users.id`。
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("accounts_issuer_accountId_uidx").on(table.issuer, table.accountId),
    index("accounts_userId_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

/**
 * 一個專案一列（§4.2）。
 *
 * `type` 只有一個值 —— **v1 不提供類型選擇、不做 UI**（只有一種類型時給選就是說謊）。
 * 欄位存在是為了「新增一種類型」那天有地方掛，不是為了現在給人選。
 *
 * `owner_id` 是 **v1 authorization 的最小掛點**（ADR-0011 §④）：它不是為協作預留的，
 * 是 v1 每次讀寫都要回答「這是不是你的」的必要資料。未來演進成 members／invitations 時
 * 是在它之上加東西，不必否定它。**v1 沒有 `invitations` 表** —— allowlist 是 env var
 * 逗號清單（`src/auth/allowlist.ts`），一看就知道是暫時物，不會假裝自己是領域模型。
 *
 * §4.2 的**專案 meta 欄位**（片名以外，還有交件 PDF 前置頁的那幾欄）此刻只落到 `title`。
 * 其餘欄位的唯一消費者是交件 PDF 的前置頁（票券 21），**現在長出來會是一組沒有寫入者、
 * 也沒有讀取者的欄位** —— 與票券 05 當初不預先長 `project_id` 是同一條理由。
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // gate 與專案 hub 問的都是同一件事：這個人有哪些專案。
  (table) => [index("projects_owner_id_idx").on(table.ownerId)],
);

/**
 * 人物與地點 —— **append-only 的名字目錄**（票券 08、[ADR-0005](../../../../docs/adr/0005-entities-exist-by-reference.md)）。
 *
 * ⚠️ **這兩張表不決定「存在」。** 一筆實體「存在」＝至少有一個引用指向它（場次 metadata、
 * 對白人物欄、角色設定表）。沒有任何引用指向的是**孤兒** —— 不出現在自動補全、不出現在
 * 場次表、不出現在任何地方，**v1 永不清理**，因為它不佔任何人的視野。
 *
 * 這條定義是有代價地換來的：doc 由編輯器管、`⌘Z` 只作用在它上面，而實體表裝的是跨場次的東西
 * （第 12 場的「小明」和第 30 場的必須是同一筆），兩者**沒有共同的交易邊界與 undo 堆疊**。
 * 於是 chip 化建了實體、⌘Z 之後 doc 退回去而這一列不會退 —— 改掉「存在」的定義讓這個問題
 * **消失**，而不是要我們自製跨儲存體的交易。
 *
 * 因此 **append-only：沒有「刪除實體」這個動作**（`src/entities/entity-store.ts` 不提供、
 * `entity-boundary.test.ts` 守著）。編劇能做的只有拿掉引用。合併別名也不刪舊 id ——
 * 引用改指向新實體，舊的自動變孤兒。
 *
 * `name` 是**真欄位**（初值＝建立時打的字，可改），不是推導值：漸進揭露下（前 8 場「未知大樓
 * 房間」、後 2 場才揭露「海豚公寓房間」）推導只會給出前者，但製片要知道去哪裡拍。
 * **別名不存在實體上** —— 別名就是各引用上的「這一場顯示的名字」，存在 doc 裡。
 *
 * **兩者都屬於專案，不屬於劇本** —— 影集那天人物跨集要有身分連續性。
 */
export const characters = pgTable(
  "characters",
  {
    /** `ch_` ＋ nanoid（`@scenephonie/schema` 的 `mintCharacterId()`），使用者永遠看不到。 */
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * 人物介紹的內文（自由文字）。消費者是 PDF 的人物介紹頁（票券 21）。
     *
     * 性別、年齡**不做成欄位** —— 人物介紹沒有規定格式，做成欄位是憑空發明約束。
     * 「主要人物」也不是旗標，就是有沒有被角色設定表收錄。
     */
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // 自動補全問的是「這個專案有哪些人物」。**刻意不是 (project_id, name) 的 unique** ——
  // 同名不同實體是合法的（同一個房間的「二十年前」與「現在」是兩筆；人物同理），
  // 身分判準不是名字。
  (table) => [index("characters_project_id_idx").on(table.projectId)],
);

/**
 * 地點。欄位比人物少一個：**沒有描述欄**。
 *
 * 這是人物與地點唯一的不對稱，而且是**有理由的**不對稱 —— 沒有任何比賽要求地點介紹，
 * 沒有消費者的欄位不長出來。
 *
 * **內外不屬於地點**（同一個公寓有內景也有外景，那是場次的欄位）；**地點實體之間沒有包含
 * 關係**（公寓 ⊃ 客廳這種樹不做：沒有 v1 消費者、要人另外填、而且沒有底）。
 * 身分判準是**美術上要不要分開處理** —— 不是名字，也不是地理位置。
 */
export const locations = pgTable(
  "locations",
  {
    /** `lo_` ＋ nanoid。 */
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("locations_project_id_idx").on(table.projectId)],
);

/**
 * 一個劇本一列。
 *
 * `doc jsonb` 而非 `text` —— 投的是除錯能力（出事時能在 `psql` 裡
 * `doc -> 'content' -> 0 -> 'attrs'` 看一眼）。真被寫入放大咬到時 `jsonb` → `text`
 * 是一行 migration（§6.7）。
 *
 * `project_id` 由票券 06 加上：**單一劇本專案是 1:1**（§4.2），所以劇本一定掛在一個專案下，
 * 而「這份劇本是誰的」永遠只有一條路可走 —— `screenplays.project_id → projects.owner_id`。
 * 沒有第二份 owner 副本，因此不會有兩個答案。
 */
export const screenplays = pgTable(
  "screenplays",
  {
    id: text("id").primaryKey(),

    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    doc: jsonb("doc").notNull(),

    /** 這份 doc 用哪一版 node schema 寫的。隨程式碼走，**部署時**才變（§6.7）。 */
    docSchemaVersion: integer("doc_schema_version").notNull(),

    /**
     * 每一次成功改變 canonical document state 的 optimistic concurrency token。
     * 不是自動存檔次數、不是版次、不對使用者曝露（§6.7）——
     * persistence 模組之外沒有任何程式碼看得到這個欄位。
     */
    docSeq: bigint("doc_seq", { mode: "number" }).notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // 專案 hub 問「這個專案有哪些劇本」。**刻意不是 unique index** —— 1:1 是「單一劇本專案」
  // 這個 type 的定義（§4.2），不是全表的永久事實；系列劇本專案那天是新增一種 type，
  // 而不是回頭拆掉一條資料庫約束。1:1 由建立劇本的那條路（application layer）保證。
  (table) => [index("screenplays_project_id_idx").on(table.projectId)],
);

/**
 * append-only before-image —— 被某次存檔覆蓋掉的那一份 doc（§6.7 自動備份）。
 *
 * **它是 recovery 機制，不是版本歷史功能**：無查閱 UI、v1 全部保留、要救稿時從 `psql` 手動撈。
 * 沒有 `updated_at`，程式碼只 `INSERT` 與人工 `SELECT`。
 *
 * append-only 在 v1 是**程式碼層的規則，不是資料庫權限層的保證** —— 誠實話：FK 的
 * `onDelete: "cascade"` 就是一條刪除路徑。它只在整列劇本被刪掉時觸發（v1 的產品面沒有刪劇本
 * 這件事，整合測試靠它清場），而一份劇本不在了，它的 before-image 也沒有消費者。真要把
 * append-only 變成保證，該做的是撤掉執行期角色的 `UPDATE`／`DELETE` 權限 —— 那是資料庫角色
 * 的事，票券 06 沒有做（它處理的是 application layer 的授權，不是 DB 權限），仍待部署時決定。
 *
 * `doc_schema_version` 是規格 §6.2 那張表沒列、但備份非有不可的欄位：before-image 存的是
 * **當時儲存的那一份 doc**，它的 schema 版本可能低於現行版本；沒有這一欄，撈回來的 doc
 * 不知道該從遷移鏈的哪一節接上，備份就失去 recovery 的價值。
 */
export const screenplayBackups = pgTable(
  "screenplay_backups",
  {
    id: text("id").primaryKey(),
    screenplayId: text("screenplay_id")
      .notNull()
      .references(() => screenplays.id, { onDelete: "cascade" }),
    doc: jsonb("doc").notNull(),
    docSchemaVersion: integer("doc_schema_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // 備份觸發判定只問一件事：這份劇本上一筆備份是什麼時候（§6.7）。
    index("screenplay_backups_screenplay_id_created_at_idx").on(
      table.screenplayId,
      table.createdAt.desc(),
    ),
  ],
);

