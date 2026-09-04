"use server";

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
  return saveScreenplay(request);
}
