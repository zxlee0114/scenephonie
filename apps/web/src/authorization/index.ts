/**
 * authorization —— 「你能操作哪個 project」的唯一出口（不變式 H、ADR-0011）。
 *
 * 模組外看得到的只有：**兩支 gate、兩個 handle 型別**。
 * `grantProject`／`grantScreenplay` 刻意不出去 —— handle 只能從 gate 手上拿到，
 * 這樣「沒授權就呼叫 command」在型別上表示不出來。
 */
export { authorizeProjectForUser, authorizeScreenplayForUser } from "./gate";
export { authorizeProject, authorizeScreenplay, currentUserId } from "./session";
export type { AuthorizedProject, AuthorizedScreenplay } from "./handles";
