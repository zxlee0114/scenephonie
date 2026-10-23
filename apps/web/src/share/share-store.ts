import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { mintId } from "@scenephonie/schema";

import type { AuthorizedScreenplay } from "@/authorization";
import { getDb } from "@/db/client";
import { deliveries, shareLinks } from "@/db/schema";
import { deliveriesChangedSince } from "@/persistence";

import { SHARE_NOTE_MAX_LENGTH } from "./share-note";

/**
 * 分享連結的生命週期 —— 編劇那一側（票券 20，§10、ADR-0008）。
 *
 * > 分享是一次具有獨立 identity 與生命週期的對外分享關係。劇本是它的欄位，不是它的身分。
 *
 * **每一支都吃已授權的劇本 handle**（不變式 H）：鑄、撤、列都是編劇的動作。訪客那一側不走這裡 ——
 * `/s/<token>` 由 gate 換成 `ShareViewer`，讀的是 persistence 的 `loadSharedScript`。
 *
 * 兩種分享是兩種意圖，不是一個開關：
 * - **即時**（`shareLive`）：一份劇本一條，跟著存檔走。
 * - **凍結**（`shareDelivery`）：一筆交付的連結 —— 匯出 PDF 後「取得這次交付的連結」，或分享面板的
 *   「建立交付連結」。**token 懶惰鑄造**：交付每次匯出都建立，連結只在這裡才鑄。
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

/** 即時分享。一份劇本同時只有一條有效的。 */
export async function shareLive(screenplay: AuthorizedScreenplay): Promise<ShareLink> {
  return activeOrMint(screenplay, null);
}

/**
 * 撤銷（可以一次幾條 —— 分享面板勾選後一鍵停用）：寫 `revoked_at`，**保留那幾列** —— 刪掉就查不出
 * 這些連結曾經存在。
 *
 * @returns 實際撤到幾條。不在這份劇本底下、或早就撤過了的不算。
 */
export async function revokeShareLinks(screenplay: AuthorizedScreenplay, shareIds: string[]): Promise<number> {
  if (shareIds.length === 0) return 0;
  const revoked = await getDb()
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        inArray(shareLinks.id, shareIds),
        eq(shareLinks.screenplayId, screenplay.screenplayId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });
  return revoked.length;
}

/**
 * 寫備註（這條給了誰）。去掉前後空白；空白 ＝ 拿掉備註。**讀者永遠看不到它**。
 *
 * @returns 寫到了沒有。不在這份劇本底下、已經撤銷、或超過長度上限，都是 `false`。
 */
export async function setShareLinkNote(
  screenplay: AuthorizedScreenplay,
  shareId: string,
  note: string,
): Promise<boolean> {
  const trimmed = note.trim();
  if (trimmed.length > SHARE_NOTE_MAX_LENGTH) return false;
  const updated = await getDb()
    .update(shareLinks)
    .set({ note: trimmed === "" ? null : trimmed })
    .where(
      and(
        eq(shareLinks.id, shareId),
        eq(shareLinks.screenplayId, screenplay.screenplayId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });
  return updated.length > 0;
}

/** 編劇自己的分享清單上的一列。 */
export type ListedShareLink = ShareLink & {
  createdAt: Date;
  /** 編劇的備註；`null` ＝ 沒寫。 */
  note: string | null;
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
      note: shareLinks.note,
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
