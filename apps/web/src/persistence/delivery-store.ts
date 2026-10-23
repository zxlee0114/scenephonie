import { isDeepStrictEqual } from "node:util";

import { and, eq } from "drizzle-orm";

import {
  deliveredEntityIds,
  docFromJSON,
  mintId,
  projectDelivery,
  type DeliveryPayload,
} from "@scenephonie/schema";

import type { AuthorizedScreenplay, ShareViewer } from "@/authorization";
import { getDb } from "@/db/client";
import { characters, deliveries, locations, screenplays } from "@/db/schema";

import { migrateDocToCurrent, type PersistedDoc } from "./doc-schema-version";

/**
 * 交付的寫入路徑（票券 17，§4.9、§9.2、ADR-0008）。
 *
 * > **Delivery 是渲染的輸入，不是渲染的產物。**
 *
 * 順序是被迫的：**先提交交付，再渲染**。「交付記了、紙沒印出來」沒有說謊，可回復；「紙到了對方
 * 手上、交付沒記」是永久損壞。所以 atomicity 邊界只有一個交易 —— `createDelivery` —— 其餘
 * （PDF、凍結分享頁）全是它的純函式，讀的是 `loadDelivery`，不是 live doc。
 *
 * **跟 `screenplay-store.ts` 的備份分開走**（§10.4）：這裡不寫 `screenplay_backups`，那邊不寫
 * `deliveries`，兩邊沒有共用的寫入函式（`delivery-boundary.test.ts` 守著）。它住在 persistence
 * 裡是因為「讀出 canonical doc」這件事（含 schema 遷移）只准住在這個模組 —— 不是因為它跟備份
 * 是同一種東西。
 *
 * 這裡**沒有 `update`、沒有 `delete`**：交付是唯一刻意不可變的表。也**沒有狀態旗標**：
 * 「產物還沒成功產生」是合法狀態，重試就是再讀一次同一列。
 */

const DELIVERY_ID_PREFIX = "dl_";

/** 一筆交付。`createdAt` 是承諾的時刻 —— PDF 頁尾印的是它，不是渲染當下的 now。 */
export type Delivery = {
  deliveryId: string;
  createdAt: Date;
  payload: DeliveryPayload;
};

/**
 * 建立一筆交付 —— 匯出意圖（不變式 D：任何對外承諾「之後改稿也不變」的動作都先走這裡）。
 *
 * **單一交易**，而且是 `repeatable read`：讀 doc、讀實體名、推導、寫入看到的是同一個快照 ——
 * 不會拍到「新的 doc 配上舊的名字」。語意推導（`projectDelivery`）在交易內完成，寫進去的是
 * 推導的結果；之後沒有任何一條路會再算一次（不變式 E）。
 *
 * 讀的是**已存檔的** doc：承諾的是 canonical state，不是某個分頁記憶體裡還沒存的那一份。
 * 匯出之前先把手上的存掉，是呼叫端（匯出按鈕，票券 18）的事。
 *
 * @returns 劇本在 handle 到手之後被刪掉時是 `null`。
 */
export async function createDelivery(screenplay: AuthorizedScreenplay): Promise<Delivery | null> {
  return getDb().transaction(
    async (tx) => {
      const current = await projectCanonical(tx, screenplay);
      if (!current) return null;

      const [row] = await tx
        .insert(deliveries)
        .values({
          id: mintId(DELIVERY_ID_PREFIX),
          screenplayId: screenplay.screenplayId,
          payload: current.payload,
          // 拍的是哪一個 canonical state —— 同一個快照裡讀的，分享清單拿它判斷「之後改過沒」（票券 20）。
          sourceDocSeq: current.docSeq,
        })
        .returning({ deliveryId: deliveries.id, createdAt: deliveries.createdAt });
      return { deliveryId: row!.deliveryId, createdAt: row!.createdAt, payload: current.payload };
    },
    { isolationLevel: "repeatable read" },
  );
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * 已存檔的 doc ＋ 專案的實體名 → 交付投影（`projectDelivery`）。交付（寫進去）與即時分享（只拿來看，
 * 票券 20）走同一條：「草稿不進、場次號跳號、群組殘缺整組不進」只有一個答案。
 *
 * `updatedAt` 是這份投影最後一次變的時刻：劇本存檔，或交付印得出名字的實體改名 —— 改名不推進
 * `doc_seq`（實體屬於專案，不屬於這份 doc），但印出來的字變了，讀的人該知道（票券 20）。
 *
 * 呼叫端要給一個 `repeatable read` 交易 —— doc 與實體名才是同一個快照。模組內部用，不從 `./index` 出去。
 *
 * @returns 劇本不在了是 `null`。
 */
export async function projectCanonical(
  tx: Transaction,
  // 只收 handle：讀 live doc 的路一律要先過 gate（編劇的劇本 handle，或分享連結的 viewer）。
  screenplay: AuthorizedScreenplay | ShareViewer,
): Promise<{ payload: DeliveryPayload; docSeq: number; updatedAt: Date } | null> {
  const [current] = await tx
    .select({
      doc: screenplays.doc,
      docSchemaVersion: screenplays.docSchemaVersion,
      docSeq: screenplays.docSeq,
      updatedAt: screenplays.updatedAt,
    })
    .from(screenplays)
    .where(eq(screenplays.id, screenplay.screenplayId))
    .limit(1);
  if (!current) return null;

  const [characterRows, locationRows] = await Promise.all([
    tx
      .select({ id: characters.id, name: characters.name, updatedAt: characters.updatedAt })
      .from(characters)
      .where(eq(characters.projectId, screenplay.projectId)),
    tx
      .select({ id: locations.id, name: locations.name, updatedAt: locations.updatedAt })
      .from(locations)
      .where(eq(locations.projectId, screenplay.projectId)),
  ]);

  const doc = docFromJSON(migrateDocToCurrent(current.doc as PersistedDoc, current.docSchemaVersion));
  const payload = projectDelivery(doc, {
    characters: new Map(characterRows.map((r) => [r.id, r.name])),
    locations: new Map(locationRows.map((r) => [r.id, r.name])),
  });

  const { characterIds, locationIds } = deliveredEntityIds(doc);
  const renamedAt = [
    ...characterRows.filter((r) => characterIds.has(r.id)),
    ...locationRows.filter((r) => locationIds.has(r.id)),
  ].map((r) => r.updatedAt.getTime());
  const updatedAt = new Date(Math.max(current.updatedAt.getTime(), ...renamedAt));
  return { payload, docSeq: current.docSeq, updatedAt };
}

/**
 * 讀回一筆已提交的交付 —— 渲染與重試的入口。**只讀 `deliveries`，不碰 live doc**：凍結的內容
 * 來源不得依賴 current state（ADR-0008），PDF 路徑因此免費拿到同一個保證。
 *
 * 交付掛在劇本底下：別份劇本的交付 id 拿這個 handle 讀不到（回 `null`，與「不存在」同一個答案）。
 */
export async function loadDelivery(
  screenplay: AuthorizedScreenplay,
  deliveryId: string,
): Promise<Delivery | null> {
  const [row] = await getDb()
    .select({ deliveryId: deliveries.id, createdAt: deliveries.createdAt, payload: deliveries.payload })
    .from(deliveries)
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.screenplayId, screenplay.screenplayId)))
    .limit(1);
  if (!row) return null;
  return { deliveryId: row.deliveryId, createdAt: row.createdAt, payload: row.payload as DeliveryPayload };
}

/**
 * 這份劇本的哪幾筆交付，之後 canonical state 又變過了（票券 20）—— 編劇自己的分享清單上那一句
 * 「這條連結凍結在 3 天前，之後劇本已有修改」。
 *
 * 判準不是時間戳（§10.1），是兩件事其一：
 * - 交付拍下的 `source_doc_seq` 落後劇本現在的 `doc_seq` ＝ 之後存過檔；
 * - doc 沒動，但現在推導出來的投影跟交付拍下的不一樣 ＝ 交付裡印得出名字的實體改過名。改名不推進
 *   `doc_seq`，所以只能比投影本身 —— doc 相同時兩份投影只可能差在實體名，比較是精確的（改了沒印
 *   出來的實體不算）。jsonb 不保留鍵序，所以用結構相等比。
 *
 * `doc_seq` 因此不必離開這個模組 —— 外面拿到的只有「哪幾筆」。
 *
 * ⚠️ **只給編劇看**（handle 是劇本的）：不對凍結連結的讀者說「作者後來又改了」（§10.2）。
 */
export async function deliveriesChangedSince(screenplay: AuthorizedScreenplay): Promise<Set<string>> {
  return getDb().transaction(
    async (tx) => {
      const current = await projectCanonical(tx, screenplay);
      if (!current) return new Set<string>();
      // 記憶體裡的投影可能帶著值為 `undefined` 的鍵（`parentSceneId`），存進 jsonb 的那份沒有。
      const now = JSON.parse(JSON.stringify(current.payload)) as DeliveryPayload;

      const rows = await tx
        .select({ deliveryId: deliveries.id, sourceDocSeq: deliveries.sourceDocSeq, payload: deliveries.payload })
        .from(deliveries)
        .where(eq(deliveries.screenplayId, screenplay.screenplayId));
      return new Set(
        rows
          .filter((r) => r.sourceDocSeq < current.docSeq || !isDeepStrictEqual(r.payload, now))
          .map((r) => r.deliveryId),
      );
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
