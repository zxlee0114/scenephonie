import { and, desc, eq, isNull } from "drizzle-orm";

import { mintId } from "@scenephonie/schema";

import type { AuthorizedScreenplay } from "@/authorization";
import { getDb } from "@/db/client";
import { deliveries, shareLinks } from "@/db/schema";
import { deliveriesChangedSince } from "@/persistence";

/**
 * 分享連結的生命週期 —— 編劇那一側（票券 20，§10、ADR-0008）。
 *
 * > 分享是一次具有獨立 identity 與生命週期的對外分享關係。劇本是它的欄位，不是它的身分。
 *
 * **每一支都吃已授權的劇本 handle**（不變式 H）：鑄、撤、列都是編劇的動作。訪客那一側不走這裡 ——
 * `/s/<token>` 由 gate 換成 `ShareViewer`，讀的是 persistence 的 `loadSharedScript`。
 *
 * 兩種分享是兩種意圖，不是一個開關：
 * - **即時**（`shareLive`）：分享面板上唯一的東西。
 * - **凍結**（`shareDelivery`）：匯出 PDF 的副產品「取得這次交付的連結」。**token 懶惰鑄造** ——
 *   交付每次匯出都建立，連結只在這裡才鑄。
 *
 * 兩支都是 get-or-mint：同時有效的只有一條，重按拿回同一條（並行由 `share_links` 的 partial unique
 * 排成序）。撤銷之後再按 ＝ 鑄新的一條 —— 舊的那列留著，不復活。
 */

const SHARE_ID_PREFIX = "sh_";

/** 一條有效的連結。`token` 是網址上的那一段；網址怎麼組是路由層的事。 */
export type ShareLink = {
  shareId: string;
  token: string;
};

/** 這一條有效連結，或鑄一條。`deliveryId` 為 `null` ＝ 即時分享。 */
async function activeOrMint(screenplay: AuthorizedScreenplay, deliveryId: string | null): Promise<ShareLink> {
  const db = getDb();
  const active = () =>
    db
      .select({ shareId: shareLinks.id, token: shareLinks.token })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.screenplayId, screenplay.screenplayId),
          deliveryId === null ? isNull(shareLinks.deliveryId) : eq(shareLinks.deliveryId, deliveryId),
          isNull(shareLinks.revokedAt),
        ),
      )
      .limit(1);

  const [existing] = await active();
  if (existing) return existing;

  // token 不帶前綴：它是公開網址上的一段，不該透露任何東西（連「這是 Scenephonie 的分享」都不必）。
  await db
    .insert(shareLinks)
    .values({ id: mintId(SHARE_ID_PREFIX), screenplayId: screenplay.screenplayId, deliveryId, token: mintId("") })
    .onConflictDoNothing();
  const [minted] = await active();
  if (!minted) throw new Error("剛鑄的分享連結讀不回來 —— 寫入沒有落地");
  return minted;
}

/**
 * 「取得這次交付的連結」—— 凍結分享。交付不在這份劇本底下回 `null`（與「不存在」同一個答案）。
 */
export async function shareDelivery(screenplay: AuthorizedScreenplay, deliveryId: string): Promise<ShareLink | null> {
  const [delivery] = await getDb()
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.screenplayId, screenplay.screenplayId)))
    .limit(1);
  if (!delivery) return null;
  return activeOrMint(screenplay, delivery.id);
}

/** 即時分享 —— 分享面板上唯一的東西。一份劇本同時只有一條有效的。 */
export async function shareLive(screenplay: AuthorizedScreenplay): Promise<ShareLink> {
  return activeOrMint(screenplay, null);
}

/**
 * 撤銷：寫 `revoked_at`，**保留那一列** —— 刪掉就查不出這條連結曾經存在。
 *
 * @returns 撤到了沒有。不在這份劇本底下、或早就撤過了，都是 `false`。
 */
export async function revokeShareLink(screenplay: AuthorizedScreenplay, shareId: string): Promise<boolean> {
  const revoked = await getDb()
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.id, shareId),
        eq(shareLinks.screenplayId, screenplay.screenplayId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });
  return revoked.length > 0;
}

/** 編劇自己的分享清單上的一列。 */
export type ListedShareLink = ShareLink & {
  createdAt: Date;
  /**
   * 凍結分享指向的那筆交付；即時分享是 `null`。`changedSince` ＝ 交付之後劇本又存過檔 ——
   * **只在編劇自己的清單上說**，凍結頁的讀者永遠看不到（§10.2）。
   */
  delivery: { deliveryId: string; deliveredAt: Date; changedSince: boolean } | null;
};

/** 這份劇本現在有效的連結，新的在前。撤銷過的不列 —— 它們還在表裡，只是不再是編劇要管的東西。 */
export async function listShareLinks(screenplay: AuthorizedScreenplay): Promise<ListedShareLink[]> {
  const [rows, changed] = await Promise.all([
    getDb()
    .select({
      shareId: shareLinks.id,
      token: shareLinks.token,
      createdAt: shareLinks.createdAt,
      deliveryId: deliveries.id,
      deliveredAt: deliveries.createdAt,
    })
    .from(shareLinks)
    .leftJoin(deliveries, eq(shareLinks.deliveryId, deliveries.id))
    .where(and(eq(shareLinks.screenplayId, screenplay.screenplayId), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt)),
    deliveriesChangedSince(screenplay),
  ]);

  return rows.map(({ deliveryId, deliveredAt, ...link }) => ({
    ...link,
    delivery: deliveryId && deliveredAt ? { deliveryId, deliveredAt, changedSince: changed.has(deliveryId) } : null,
  }));
}
