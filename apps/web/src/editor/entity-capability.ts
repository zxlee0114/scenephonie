/**
 * 「建立一筆實體」「把實體改名」這兩個能力的形狀 —— **編輯器手上那兩個函式**
 * （比照 `./save-capability.ts`）。
 *
 * client 拿到的是這個型別的函式（由 page 從 server action 注入），不是 entity store 本身：
 * 編輯器不認識路由層，路由層也不被編輯器 import（§6.3 edge boundary）。這個檔案沒有任何
 * 執行期相依，編輯器、server action、page 三邊都 import 得起。
 *
 * ⚠️ `projectId` 從瀏覽器來，**不是已授權的 handle** —— server action 的第一件事就是拿它過
 * gate（不變式 H）。實體屬於專案，所以授權主體是專案，不是劇本。
 */

export type CreateEntityRequest = {
  projectId: string;
  kind: "character" | "location";
  name: string;
};

export type RenameEntityRequest = {
  projectId: string;
  kind: "character" | "location";
  entityId: string;
  name: string;
};

/** 建立成功回一筆 `{ id, name }`；沒授權或失敗回 `null`（呼叫端就不寫那個引用）。 */
export type CreateEntity = (
  request: CreateEntityRequest,
) => Promise<{ id: string; name: string } | null>;

export type RenameEntity = (request: RenameEntityRequest) => Promise<boolean>;

/** 一份專案的名字目錄，進站時由伺服器端一次載入。 */
export type EntityCatalogSnapshot = {
  characters: { id: string; name: string }[];
  locations: { id: string; name: string }[];
};
