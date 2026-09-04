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
import { nullableSceneAttrNames } from "./schema";

export function hasEmptySceneMeta(scene: { readonly attrs: Record<string, unknown> }): boolean {
  return nullableSceneAttrNames.every((name) => {
    const value = scene.attrs[name];
    return value == null || (Array.isArray(value) && value.length === 0);
  });
}
