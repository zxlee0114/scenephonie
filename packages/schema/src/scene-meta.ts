/**
 * 「這一場的 metadata 填了沒」的單一判準（票券 31）。
 *
 * 判準就是 §5.3 的 null 鐵律名單 `nullableSceneAttrNames` —— 那份名單本來就是
 * 「空著＝尚未填」的欄位（空 metadata → 自動草稿）。不允許 null 的欄位（`extras`、
 * `manualDraft`）不參與：它們沒有「未填」這個狀態，空陣列就是「沒有」。
 *
 * 只讀 attr，不讀內文 —— 「這一場還沒開工」是 metadata 全空**且**沒有內文，後半條在
 * 呼叫端各自判（誰要用得看它自己的 node 型別）。
 *
 * 參數刻意只要求結構上有 `attrs`：編輯器那半用的是 Tiptap 綁定版 schema 的節點，
 * 與 kernel 的 `ProseMirrorNode` 是兩個型別，但 attr 形狀同一份。
 */
import { sceneLocations } from "./entities";
import { MONTAGE, nullableSceneAttrNames } from "./schema";

export function hasEmptySceneMeta(scene: { readonly attrs: Record<string, unknown> }): boolean {
  return nullableSceneAttrNames.every((name) => {
    const value = scene.attrs[name];
    return value == null || (Array.isArray(value) && value.length === 0);
  });
}

/**
 * 「這一場的 metadata 完整嗎」—— 草稿推導的第三條不變式（票券 14，§4.8）。不完整 → 自動草稿。
 *
 * 與 `hasEmptySceneMeta`（全空）是兩個問題：那支問「還沒開工」，這支問「有沒有任何一欄沒填」。
 *
 * | 欄位 | 要求 |
 * |---|---|
 * | 時間、內外 | 有值 |
 * | 地點 | 有值 —— **`內外＝雜景` 時留空合法**（「完整」的定義隨內外的值改變，§4.3） |
 * | 登場人物 | **不參與**（使用者裁決 2026-10-21）：空景沒有任何人入鏡，要求它有值等於讓那場永遠是草稿 |
 */
export function isSceneMetaIncomplete(scene: { readonly attrs: Record<string, unknown> }): boolean {
  const { time, intExt, location } = scene.attrs;
  if (time == null || intExt == null) return true;
  if (intExt === MONTAGE) return false;
  // 走讀取正規化：「有沒有地點」與 `sameSceneMeta`／`sameSpaceTime` 看到的是同一份。
  return sceneLocations(location).length === 0;
}
