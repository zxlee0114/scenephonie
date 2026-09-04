"use server";

import { saveScreenplay, type PersistedDoc, type SaveToken } from "@/persistence";

/**
 * 編輯器的存檔入口。
 *
 * 它看得到的只有「存一份 doc，帶著上次拿到的 token」。這一層之外沒有任何程式碼認識
 * persistence 用來守住承諾的那些內部機制（§6.7）—— `persistence-boundary.test.ts` 是那條線的守衛。
 */
export async function saveScreenplayAction(input: {
  screenplayId: string;
  doc: PersistedDoc;
  token: SaveToken;
}): Promise<{ status: "saved"; token: SaveToken } | { status: "conflict" }> {
  return saveScreenplay(input);
}
