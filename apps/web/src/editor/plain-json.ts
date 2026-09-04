/**
 * 跨 Server Action 邊界前的 doc 正規化。
 *
 * ⚠️ 這個函式看起來像 no-op，**它不是**。ProseMirror 的 `Node.toJSON()` 把每個節點的 `attrs`
 * 建成 **null-prototype 物件**（`Object.create(null)`，見 prosemirror-model 的 `computeAttrs`）。
 * React 的 Server Action 序列化把這種物件當成「不可傳遞」——它不丟錯，而是換成一個
 * temporary reference（`react-server-dom-*-client` 裡 `null === getPrototypeOf(value)` 那條分支
 * `return "$T"`），於是伺服器端收到的 doc **每一個節點的 attr 都不見了**：`sceneId`、`time`、
 * `intExt`、`voiceStyle`⋯⋯全部靜默消失，沒有任何錯誤訊息。
 *
 * 症狀長得完全不像資料遺失：存檔照樣回報成功，重整之後所有場次號變成同一個數字
 * （`sceneId` 全成了 `null`，`projectScenes` 的查表全落在同一格）。
 *
 * 所以：**任何要交給 Server Action 的 ProseMirror JSON，都得先走這一趟。**
 * 用 `JSON.parse(JSON.stringify())` 而不是 `structuredClone()` —— 我們要的正是「能被 JSON
 * 表達」這件事本身，那也正是這份 doc 進到 `jsonb` 欄位時會經歷的事。
 */
export function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
