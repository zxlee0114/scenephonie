/**
 * authorization —— 「你能操作哪個 project」的唯一出口（不變式 H、ADR-0011）。
 *
 * 模組外看得到的只有：**四支 gate、四個 handle 型別**（第三個是分享連結的唯讀 viewer，票券 20；
 * 第四個是只有「還原」收的已刪除專案，票券 72）。
 * `grantProject`／`grantScreenplay` 刻意不出去 —— handle 只能從 gate 手上拿到，
 * 這樣「沒授權就呼叫 command」在型別上表示不出來。
 */
export {
  authorizeDeletedProjectForUser,
  authorizeProjectForUser,
  authorizeScreenplayForUser,
  authorizeShareToken,
} from "./gate";
export { authorizeDeletedProject, authorizeProject, authorizeScreenplay, currentUserId } from "./session";
export type { AuthorizedProject, AuthorizedScreenplay, DeletedProject, ShareViewer } from "./handles";
