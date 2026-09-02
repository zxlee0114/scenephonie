import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let cached: PostgresJsDatabase<typeof schema> | undefined;

/**
 * 執行期資料庫 handle。lazy —— 不在 module load 時連線，好讓 `next build`
 * 不需要 `DATABASE_URL`。
 *
 * `DATABASE_URL` 走 Supavisor transaction mode（`:6543`）。transaction pooler
 * 不支援 prepared statements，所以 `prepare: false` 是**必要設定不是優化**
 * （規格 §13.1）。Supabase direct connection 是 IPv6-only 而 Vercel 不支援
 * IPv6，因此 pooler 是硬需求。migration 另走 `DIRECT_URL`（見 drizzle.config.ts）。
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
