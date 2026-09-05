import { getAuth } from "@/auth/auth";

/**
 * auth library 的全部端點（`/api/auth/*`）—— sign-in、OAuth callback、sign-out、get-session。
 *
 * ⚠️ **這裡沒有、也不會有授權判斷**：它只回答「你是誰」。「你能操作哪個 project」住在
 * `src/authorization/` 的 gate，由每個 route handler 自己叫（不變式 H、ADR-0011）。
 */

// route handler 要連得到 Postgres（DB session）—— 不可 edge-only（§13.1）。
export const runtime = "nodejs";

// `getAuth()` 在請求裡才求值 —— module load 時取用環境變數會讓 `next build` 需要 auth 的
// secrets（與 `getDb()` 同一個理由）。
export const GET = (request: Request): Promise<Response> => getAuth().handler(request);
export const POST = (request: Request): Promise<Response> => getAuth().handler(request);
