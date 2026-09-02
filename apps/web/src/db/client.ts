import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let cached: PostgresJsDatabase<typeof schema> | undefined;

/**
 * 執行期資料庫 handle。lazy —— 不在 module load 時連線，好讓 `next build`
 * 不需要 `DATABASE_URL`。
 *
 * `DATABASE_URL` 走 Supavisor transaction mode（`:6543`），故 `prepare: false`。
 * 連線模型的完整理由（為何 pooler 是硬需求、migration 為何另走 `DIRECT_URL`）
 * 見 docs/tech-stack.md「連線模型」——此處不重複。
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 未設定");
  }

  const client = postgres(connectionString, { prepare: false });
  cached = drizzle(client, { schema });
  return cached;
}
