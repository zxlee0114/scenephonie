import { defineConfig } from "drizzle-kit";

/**
 * migration 走 `DIRECT_URL` —— Supabase session mode（direct / session pooler）。
 * 執行期查詢走 `DATABASE_URL` —— Supavisor transaction mode `:6543` + `prepare: false`
 * （見 `src/db/client.ts`）。規格 §13.1：transaction pooler 不保留 session state，
 * 不適合跑 migration；direct connection 是 IPv6-only、Vercel 不支援，故 migration
 * 走 session pooler。
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
