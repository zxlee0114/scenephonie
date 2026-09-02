import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 骨架期的最小資料表 —— 只為了讓 `drizzle-kit generate` 有 schema 可生成、
 * 讓 migration 指令跑得起來、讓 `/api/health` 能對真實表做一次 round-trip。
 * 後續票券建立第一張真正的表時應一併刪掉它與 migration `0000`。
 *
 * 真正的 `projects` / `screenplays` 等表由後續票券定義。ADR-0007：關聯式表
 * 只裝「本來就不在 doc 裡的東西」，doc（ProseMirror JSON）才是唯一權威。
 */
export const scaffoldHealth = pgTable("scaffold_health", {
  id: uuid("id").defaultRandom().primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
