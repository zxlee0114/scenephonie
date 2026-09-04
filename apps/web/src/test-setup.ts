/**
 * 測試環境補件 —— jsdom 沒有版面引擎，`Range` 缺 `getClientRects`／`getBoundingClientRect`。
 *
 * ProseMirror 在 `scrollIntoView`（`editor.chain().focus()` 會帶著跑）時走 `coordsAtPos` →
 * `singleRect(range)`，在 jsdom 就炸 `target.getClientRects is not a function`。那是**環境**
 * 缺件不是產品缺陷（瀏覽器兩個方法都在），但它從非同步路徑丟出來，vitest 會記成 unhandled
 * error 讓整輪失敗。這裡給零矩形的 no-op 實作，捲動計算在無版面環境下本來就沒有意義。
 *
 * node 環境的測試檔沒有 `Range`，直接跳過。
 */
const ZERO_RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
} as DOMRect;

if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () =>
    Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => ZERO_RECT;
}
