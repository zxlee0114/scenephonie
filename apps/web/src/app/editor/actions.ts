"use server";

import { docFromJSON } from "@scenephonie/schema";

import { saveScreenplay, type SaveRequest, type SaveResult } from "@/persistence";

/**
 * 編輯器的存檔入口。
 *
 * 它看得到的只有「存一份 doc，帶著上次拿到的 token」。這一層之外沒有任何程式碼認識
 * persistence 用來守住承諾的那些內部機制（§6.7）—— `persistence-boundary.test.ts` 是那條線的守衛。
 *
 * ⚠️ **這個端點目前沒有授權 gate**：任何 client 都能對任意 `screenplayId` 發動整份 doc 覆寫。
 * 票券 06（認證、授權 gate、`ownerId`）要在這裡加上 route handler 層的 gate ——
 * 授權不進 command、也不靠 UI 藏（不變式 H／I、ADR-0011／ADR-0012）。**在那之前不得上線給外人用。**
 */
export async function saveScreenplayAction(request: SaveRequest): Promise<SaveResult> {
  // 寫入邊界的 canonical 驗證，對稱於 §6.6 的讀取邊界：**進資料庫的 doc 必須是 hydrate 得起來的**。
  // 這道關卡的由來是一個真實事故 —— ProseMirror 的 null-prototype `attrs` 過不了 Server Action
  // 的序列化，整份 doc 的 attr 被靜默清空後照樣存檔成功（見 editor/plain-json.ts）。
  // 客戶端那邊已經修好；這裡是「同一類事故不准再靜默落地」的保證：`sceneId` 無 default，
  // 少了它 `Node.fromJSON` 就會炸，於是壞掉的 doc 只會變成一次大聲的失敗，不會變成壞掉的稿。
  docFromJSON(request.doc);
  return saveScreenplay(request);
}
