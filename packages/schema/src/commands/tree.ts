/**
 * doc 頂層子節點的不可變陣列操作。
 *
 * 本票券的三個 command 只動 doc 的頂層序列（插入一場、搬移一場、換掉一場裡的
 * 一個區塊），用陣列 splice ＋ 重建比 `Slice`／`ReplaceStep` 的開合深度計算單純，
 * 也更好在 Node 裡讀測試。真正要走 `Step` 的是編輯器端與去重 plugin。
 */
import { type Node as ProseMirrorNode } from "prosemirror-model";

import { schema } from "../schema";

/** doc 的頂層子節點展開成陣列。 */
export function topLevelArray(doc: ProseMirrorNode): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];
  doc.forEach((node) => out.push(node));
  return out;
}

/** 用一組頂層子節點重建 doc（沿用同一份 schema，維持 Yjs 升級路徑前提）。 */
export function docFrom(children: ProseMirrorNode[]): ProseMirrorNode {
  return schema.node("doc", null, children);
}

/** 換掉某個父節點的第 `index` 個子節點，回傳新的父節點（type／attrs／marks 不變）。 */
export function replaceChild(
  parent: ProseMirrorNode,
  index: number,
  next: ProseMirrorNode,
): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];
  parent.forEach((child) => children.push(child));
  children[index] = next;
  return parent.type.create(parent.attrs, children, parent.marks);
}
