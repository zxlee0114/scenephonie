import { bigint, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 關聯式表只裝「本來就不在 doc 裡的東西」（ADR-0007、§6.2）——
 * doc（ProseMirror JSON）是唯一權威，這些欄位永遠不是它的第二份副本。
 *
 * ⚠️ 這裡沒有 `scenes` 表，而且日後也不會有：場次「存在」就是它在那棵樹上。
 */

/**
 * 一個劇本一列。
 *
 * `doc jsonb` 而非 `text` —— 投的是除錯能力（出事時能在 `psql` 裡
 * `doc -> 'content' -> 0 -> 'attrs'` 看一眼）。真被寫入放大咬到時 `jsonb` → `text`
 * 是一行 migration（§6.7）。
 *
 * `project_id` 由票券 06 加上並回填 —— 此刻沒有 `projects` 表，先不長一個沒有寫入者的欄位。
 */
export const screenplays = pgTable("screenplays", {
  id: text("id").primaryKey(),

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
});

/**
 * append-only before-image —— 被某次存檔覆蓋掉的那一份 doc（§6.7 自動備份）。
 *
 * **它是 recovery 機制，不是版本歷史功能**：無查閱 UI、v1 全部保留、要救稿時從 `psql` 手動撈。
 * 沒有 `updated_at`、沒有刪除路徑；只有 `INSERT` 與人工 `SELECT`。
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

