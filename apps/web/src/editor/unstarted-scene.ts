/**
 * 「這一場還沒開工」——`/next` 剛建完、人還沒填任何東西的樣子（票券 31）。
 *
 * 兩個讀者：載入時的焦點落點（`use-screenplay-editor`，票券 31）與「離開時才判定」的鎖
 * （`extensions/scene-numbers`，票券 14 —— 新劇本唯一的一場還沒開工，等同剛新增，起步是正式）。
 *
 * metadata 全空**且**沒有內文兩條都要成立：
 * - 填了一半代表人已經在處理這一場，把游標搶回 chip 會打斷他；
 * - 有內文（先寫戲再回頭填表）代表工作已經在內文裡，一樣不該搶。
 */
import type { Node as PMNode } from "@tiptap/pm/model";

import { hasEmptySceneMeta } from "@scenephonie/schema";

export function isUnstartedScene(scene: PMNode): boolean {
  if (!hasEmptySceneMeta(scene)) return false;
  // 「沒有內文」＝ 還是 `/next` 剛產出的形狀：單一空 `action` 區塊（kernel 的 `emptyScene()`）。
  // 用 `textContent === ""` 判會太寬 —— 空的對白或插入畫面區塊也沒有文字，但那是人已經把
  // 游標帶進內文、按過 Tab 的痕跡，一樣不該把焦點搶回 chip。
  const only = scene.childCount === 1 ? scene.firstChild : null;
  return only != null && only.type.name === "action" && only.content.size === 0;
}
