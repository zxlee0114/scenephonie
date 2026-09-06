import { cleanupExpiredGuests, GUEST_TTL_DAYS } from "@/guest/guest-ttl";

// route handler 必須連得到 Postgres —— 不可 edge-only（規格 §13.1 硬邊界）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 每日排程：清掉過期的訪客（票券 25 §6／§7、`vercel.json` 的 `crons`）。
 *
 * 它同時**就是**票券 25 §7 那支 keep-alive ping —— 一次真的資料庫查詢，Supabase Free 的
 * 「七天無活動即暫停」因此不會發生。兩件事共用一支排程不是省事：它們的週期、失敗後果與
 * 「該不該有第二支」的答案完全一樣，拆開只會多一個會各自壞掉的東西。
 *
 * ## 認證：`CRON_SECRET`，fail closed
 *
 * Vercel 的排程請求帶 `Authorization: Bearer $CRON_SECRET`。**沒設 secret 就整支關閉**，
 * 而不是「沒設就放行」—— 這是一個刪資料的端點，它的預設值不能是「誰都能打」。
 *
 * ⚠️ 這裡的 secret **不是授權真理**（不變式 I）：它回答的是「這通請求是不是排程器發的」，
 * 而不是「誰能操作哪個 project」。這個端點也因此不接受任何參數 —— 它不能被用來指定
 * 刪誰，只能執行那條寫死的政策。
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // 大聲一點：沒設 secret 的後果不只是「清理沒跑」，連 keep-alive ping 也一起沒跑，
    // 而那個失敗會在七天後變成「資料庫被暫停、要人工從 dashboard 復原」。排程每天打一次，
    // 所以這一行每天會在部署紀錄裡出現一次 —— 沉默才是這裡真正的風險。
    console.warn("CRON_SECRET 未設定 —— 訪客 TTL 清理與 keep-alive ping 都不會執行");
    return new Response(null, { status: 404 });
  }

  // ⚠️ 不做 constant-time 比較，而且這是一個裁決不是疏漏：secret 是 32 bytes 的隨機值，
  // 靠網路上的時序差反推它需要的樣本數遠大於雜訊，而攻擊者拿到它也只能觸發一條寫死的
  // 政策（這支端點不收任何參數）。真正的控制是那條政策本身，不是這一行比較。
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 404 });
  }

  const deleted = await cleanupExpiredGuests();

  // 回傳筆數不回傳 id：這支端點的讀者是排程器的執行紀錄，不是稽核軌跡。
  return Response.json({ ttlDays: GUEST_TTL_DAYS, deleted: deleted.length });
}
