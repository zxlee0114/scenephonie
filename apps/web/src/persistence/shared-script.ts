import { and, eq } from "drizzle-orm";

import type { DeliveryPayload } from "@scenephonie/schema";

import type { ShareViewer } from "@/authorization";
import { getDb } from "@/db/client";
import { deliveries } from "@/db/schema";

import { projectCanonical } from "./delivery-store";

/**
 * 分享頁讀到的內容（票券 20，§10）—— **只收 `ShareViewer`**，這是那個 handle 唯一的去處。
 *
 * 兩種分享讀的是同一個形狀（交付投影），分享頁因此只有一套畫法：
 *
 * - **即時**：live doc 的投影，**當場推導、不寫回**（讀取路徑一律不寫，§6.7）。草稿不進 —— 與 PDF
 *   同一個 `projectDelivery`，分享頁不另算一份。`updatedAt` 是頁頂「最後更新於 X」的 X：它只在存檔
 *   推進 canonical state 時才動，是那個事實的人類可讀投影，不是判準本身。
 * - **凍結**：只讀那筆交付，**永遠不碰 live doc**（ADR-0008）。`deliveredAt` 是「這是 X 時交付的
 *   版本」的 X。這裡刻意**不回答**「之後改過沒」—— 那是對被凍結的受眾洩漏 current state（§10.2）；
 *   那句話只在編劇自己的分享清單上說（`deliveriesChangedSince`）。
 */
export type SharedScript =
  | { kind: "live"; updatedAt: Date; payload: DeliveryPayload }
  | { kind: "frozen"; deliveredAt: Date; payload: DeliveryPayload };

/** @returns 劇本或交付在 gate 之後才不見時是 `null`（與撤銷同一個中性頁面）。 */
export async function loadSharedScript(viewer: ShareViewer): Promise<SharedScript | null> {
  if (viewer.deliveryId !== null) {
    const [row] = await getDb()
      .select({ createdAt: deliveries.createdAt, payload: deliveries.payload })
      .from(deliveries)
      .where(and(eq(deliveries.id, viewer.deliveryId), eq(deliveries.screenplayId, viewer.screenplayId)))
      .limit(1);
    return row ? { kind: "frozen", deliveredAt: row.createdAt, payload: row.payload as DeliveryPayload } : null;
  }

  const current = await getDb().transaction((tx) => projectCanonical(tx, viewer), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
  return current ? { kind: "live", updatedAt: current.updatedAt, payload: current.payload } : null;
}
