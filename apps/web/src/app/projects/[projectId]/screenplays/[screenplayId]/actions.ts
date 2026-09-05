"use server";

import { docFromJSON } from "@scenephonie/schema";

import { authorizeScreenplay } from "@/authorization";
import type { SaveOutcome, SaveScreenplayRequest } from "@/editor/save-capability";
import { saveScreenplay } from "@/persistence";

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
