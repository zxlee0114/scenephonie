/**
 * React node view（場次、對白）的 `ignoreMutation` —— 取代 Tiptap 預設的那一支。
 *
 * **為什麼要換**（驗收 2026-10-21，票券 12；開著 DevTools 時 CPU 100%、`RESULT_CODE_HUNG`）：
 * Tiptap 預設的 `NodeView.ignoreMutation` 有一條行動裝置分支 —— `isiOS() || isAndroid()`、
 * 編輯器有焦點、增刪的節點都 `isContentEditable` 時**不忽略**。它的 `isiOS()` 用
 * `userAgent.includes("Mac") && "ontouchend" in document` 認 iPad，開著 DevTools 的 Mac Chrome
 * 也會中。於是 React 掛上 node view 的畫面（`div.block`、`div.scene`）、Tiptap 把 contentDOM
 * 搬進 `NodeViewContent` 的那幾筆變動全被 ProseMirror 讀回：整個節點標髒 → 重建 node view →
 * React 又掛一次 → 又讀回，停不下來。斷路器（`../extensions/runaway-guard`）的 `accepted`
 * 紀錄裡全是這種變動，就是這樣抓到的。
 *
 * 規則只剩一條：變動落在**這個 node view 自己的 contentDOM** 裡才讀回（文字是 ProseMirror 的）；
 * 落在 React 畫的外殼上（chip row、人物欄、外框、搬 contentDOM 本身）一律忽略。
 *
 * 只拿得到 `mutation`、拿不到 node view，所以從 DOM 認：ProseMirror 只會把變動交給離目標
 * **最近**的那個 node view，目標往上找到的第一個 `.react-renderer` 就是它；Tiptap 給 React node
 * view 的 contentDOM 都帶 `data-node-view-content-react`。
 */
export function ignoreReactChromeMutation({
  mutation,
}: {
  mutation: MutationRecord | { type: "selection"; target: Node };
}): boolean {
  // 選取變動交給 ProseMirror 自己判斷（同 Tiptap 預設）。
  if (mutation.type === "selection") return false;
  const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
  if (!target) return true;
  const renderer = target.closest(".react-renderer");
  const content = target.closest("[data-node-view-content-react]");
  // contentDOM 自己的屬性（Tiptap 預設也忽略）。
  if (content === target && mutation.type === "attributes") return true;
  // 往上先碰到的 contentDOM 若在這個 node view 外面（是祖先場次的內文），目標就在外殼上。
  return !(content && renderer && renderer.contains(content));
}
