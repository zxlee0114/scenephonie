import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";

// route handler 必須連得到 Postgres —— 不可 edge-only（規格 §13.1 硬邊界）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const rows = await getDb().execute<{ ok: number }>(sql`select 1 as ok`);
    return Response.json({ status: "ok", db: rows[0]?.ok === 1 });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
