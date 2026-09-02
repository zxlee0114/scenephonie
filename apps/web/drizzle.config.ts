import { defineConfig } from "drizzle-kit";

// migration 走 DIRECT_URL（session mode）——原因見 docs/tech-stack.md「連線模型」。
// 硬性要求 DIRECT_URL：若缺就大聲失敗，不 fallback 到 DATABASE_URL（那條是 :6543
// transaction pooler，不保留 session state、不適合跑 migration）。與 src/db/client.ts
// 對 DATABASE_URL 缺失的處理一致。
const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  throw new Error("DIRECT_URL 未設定（migration 需要 session mode 連線，見 docs/tech-stack.md）");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: directUrl },
});
