/**
 * `@scenephonie/schema` —— isomorphic 場次 schema 與推導函式。
 *
 * 邊界規則（規格 §5.5 / §13.2 階段 0）：這個套件不得有任何瀏覽器相依。
 * 沒有 DOM、沒有 `window`、沒有 React —— `tsconfig.json` 不載入 `lib.dom`，
 * 且 ESLint 會擋掉 `react` / `next` / `@tiptap/*` 的 import 與 `window`/`document`
 * 全域。它必須能單獨在 Node 跑測試（PDF 匯出、場次表推導、伺服器端 command 都會用），
 * 也要能把同一份 schema 餵給日後的 Yjs 路徑。
 *
 * 真正的 node spec（`doc` / `scene` / `sceneBlock`）與 `projectScenes(doc)` 由
 * 票券 02 實作。這裡只放一個佔位的純函式，讓骨架期的 import 邊界與 smoke 測試
 * 有東西可驗。
 */

/**
 * 依文件順序把 N 個場次推導成 `1..N`。
 *
 * 票券 02 會用真正吃 ProseMirror doc 的 `projectScenes(doc)` 取代這個
 * 只吃數量的佔位版本；推導值不進 doc、不進 DB（規格 §5.4）。
 */
export function projectSceneNumbers(sceneCount: number): number[] {
  if (!Number.isInteger(sceneCount) || sceneCount < 0) {
    throw new RangeError(`sceneCount 必須是非負整數，收到 ${String(sceneCount)}`);
  }
  return Array.from({ length: sceneCount }, (_, i) => i + 1);
}
