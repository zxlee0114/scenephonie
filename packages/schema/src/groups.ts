/**
 * 場次群組的推導值（票券 12、ADR-0004）—— 純函式，Node 與瀏覽器都能跑。
 *
 * 「以下對剪」與片段的歸屬標記都是模板產物（約束 2），日後 PDF 與編輯器吃同一批推導，不進資料模型。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { sameSceneMeta } from "./subscenes";

/**
 * 不變式 ③：同一群組裡，metadata 與**另一個成員**完全相同的那些成員（依成員順序）。
 *
 * 相同的話依場次的定義它們不是兩個場次 → 視為不完整 → 自動草稿 → 匯出前被攔（草稿的推導在
 * 票券 14 接上這一支，同 `subsceneEchoesParent`）。它同時是 PDF 歸屬標記「能區別成員」的
 * 保證 —— 顯示名相同時補印區別欄位，前提是一定有欄位不同（ADR-0004）。
 */
export function echoingMembers(group: ProseMirrorNode): string[] {
  const members: ProseMirrorNode[] = [];
  group.forEach((child) => {
    if (child.type.name === "groupMember") members.push(child);
  });
  return members
    .filter((m) => members.some((other) => other !== m && sameSceneMeta(m, other)))
    .map((m) => m.attrs.sceneId as string);
}
