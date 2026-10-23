"use server";

import { docFromJSON } from "@scenephonie/schema";

import { authorizeProject, authorizeScreenplay } from "@/authorization";
import { createCharacter, createLocation, renameCharacter, renameLocation } from "@/entities";
import type { CreateEntityRequest, RenameEntityRequest } from "@/editor/entity-capability";
import type { SaveOutcome, SaveScreenplayRequest } from "@/editor/save-capability";
import { createDelivery, saveScreenplay } from "@/persistence";
import { listShareLinks, revokeShareLink, shareDelivery, shareLive, type ListedShareLink } from "@/share/share-store";

/**
 * 編輯器的存檔入口。
 *
 * 它看得到的只有「存一份 doc，帶著上次拿到的 token」。這一層之外沒有任何程式碼認識
 * persistence 用來守住承諾的那些內部機制（§6.7）—— `persistence-boundary.test.ts` 是那條線的守衛。
 *
 * **授權在這裡，而且只在這裡**（不變式 H、票券 06）：`screenplayId` 從瀏覽器來，是任何字串；
 * 它要先換成一個已授權的 handle 才進得了 persistence。這不是「記得檢查」的紀律，是型別 ——
 * `saveScreenplay` 根本不收字串。
 *
 * **授權不進 command，也不靠 UI 藏。** Server Action 是一個公開端點：它不會因為畫面上
 * 沒有連結就沒有人打得到。
 */
export async function saveScreenplayAction(
  request: SaveScreenplayRequest,
): Promise<SaveOutcome> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return { status: "forbidden" };

  // 寫入邊界的 canonical 驗證，對稱於 §6.6 的讀取邊界：**進資料庫的 doc 必須是 hydrate 得起來的**。
  // 這道關卡的由來是一個真實事故 —— ProseMirror 的 null-prototype `attrs` 過不了 Server Action
  // 的序列化，整份 doc 的 attr 被靜默清空後照樣存檔成功（見 editor/plain-json.ts）。
  // 客戶端那邊已經修好；這裡是「同一類事故不准再靜默落地」的保證：`sceneId` 無 default，
  // 少了它 `Node.fromJSON` 就會炸，於是壞掉的 doc 只會變成一次大聲的失敗，不會變成壞掉的稿。
  //
  // ⚠️ 順序有意義：**先授權再驗證**。不然一個沒授權的呼叫端可以拿 doc 的形狀當試探。
  docFromJSON(request.doc);

  return saveScreenplay({ screenplay, doc: request.doc, token: request.token });
}

/**
 * 匯出意圖：建立一筆交付（票券 17，不變式 D）。
 *
 * **先提交交付，再渲染**（§9.2）—— 這支只做前一半：一個交易、寫進推導的結果，回傳那一筆的 id。
 * 渲染器（票券 18）與凍結分享（票券 20）拿這個 id 讀交付，不讀 live doc；渲染失敗就再讀同一筆，
 * 不會再呼叫這支（那會多一筆交付）。
 *
 * 讀的是**已存檔**的 doc —— 呼叫端要先把手上的存掉，承諾的是 canonical state。
 */
export async function createDeliveryAction(request: {
  screenplayId: string;
}): Promise<{ status: "delivered"; deliveryId: string } | { status: "forbidden" }> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return { status: "forbidden" };

  const delivery = await createDelivery(screenplay);
  // 劇本在授權之後才不見：與「不是你的」同一個答案（不給存在性探針）。
  if (!delivery) return { status: "forbidden" };
  return { status: "delivered", deliveryId: delivery.deliveryId };
}

/**
 * 建立一筆人物或地點。
 *
 * **授權主體是專案，不是劇本** —— 實體屬於專案（影集那天人物跨集有身分連續性），所以這裡
 * 過的是 `authorizeProject`。`projectId` 從瀏覽器來，跟 `screenplayId` 一樣是任何字串。
 *
 * ⚠️ 這支必須在編輯器寫 doc **之前**跑完：domain command 的引用完整性檢查（不變式 ⑧）問的是
 * 實體表，反過來的話每一次建立新人物都會被自己的不變式擋下（§6.6）。
 */
export async function createEntityAction(
  request: CreateEntityRequest,
): Promise<{ id: string; name: string } | null> {
  const project = await authorizeProject(request.projectId);
  if (!project) return null;

  // 空名字不建實體 —— 那會是一筆永遠沒人認得出來的孤兒。
  const name = request.name.trim();
  if (!name) return null;

  const entity =
    request.kind === "character"
      ? await createCharacter(project, { name })
      : await createLocation(project, { name });

  return { id: entity.id, name: entity.name };
}

/**
 * 把實體改名。名字是真欄位（初值＝建立時打的字），所以它可以改。
 *
 * **改的是實體的名字，不是各引用上的顯示名** —— 別名不存在實體上，改名不代換全文
 * （漸進揭露下那可能正是編劇要的）。
 */
export async function renameEntityAction(request: RenameEntityRequest): Promise<boolean> {
  const project = await authorizeProject(request.projectId);
  if (!project) return false;

  const name = request.name.trim();
  if (!name) return false;

  const renamed =
    request.kind === "character"
      ? await renameCharacter(project, request.entityId, name)
      : await renameLocation(project, request.entityId, name);

  return renamed !== null;
}

/**
 * 「取得這次交付的連結」—— 凍結分享（票券 20，§10.2）。**token 懶惰鑄造**：匯出不會走到這裡，
 * 只有編劇按了那顆鈕才會。已經有一條有效的就拿回那一條。
 *
 * @returns token；不是你的劇本、或交付不在這份劇本底下，都是 `null`（同一個答案）。
 */
export async function shareDeliveryAction(request: { screenplayId: string; deliveryId: string }): Promise<string | null> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return null;
  return (await shareDelivery(screenplay, request.deliveryId))?.token ?? null;
}

/**
 * 分享面板的「建立交付連結」：用現在的存檔建立一筆交付（不印 PDF），再鑄它的連結。存檔是呼叫端先做的。
 * 交付建了、連結沒鑄成也無妨 —— 快照必然、連結自願（§10.2），重按是另一筆交付。
 */
export async function shareSnapshotAction(request: { screenplayId: string }): Promise<boolean> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return false;
  const delivery = await createDelivery(screenplay);
  if (!delivery) return false;
  return (await shareDelivery(screenplay, delivery.deliveryId)) !== null;
}

/** 建立即時連結（已有就拿回那一條）。 */
export async function shareLiveAction(request: { screenplayId: string }): Promise<boolean> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return false;
  await shareLive(screenplay);
  return true;
}

/**
 * 編劇自己的分享清單。凍結連結帶著「之後劇本已有修改」—— **只在這裡說**，凍結頁的讀者看不到（§10.2）。
 * 沒有權限就是空清單：不給存在性探針。
 */
export async function shareLinksAction(request: { screenplayId: string }): Promise<ListedShareLink[]> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return [];
  return listShareLinks(screenplay);
}

/** 停用一條連結：寫 `revoked_at`、保留那一列（§10.3）。 */
export async function revokeShareLinkAction(request: { screenplayId: string; shareId: string }): Promise<boolean> {
  const screenplay = await authorizeScreenplay(request.screenplayId);
  if (!screenplay) return false;
  return revokeShareLink(screenplay, request.shareId);
}
