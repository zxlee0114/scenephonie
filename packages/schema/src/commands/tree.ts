/**
 * doc 頂層子節點的不可變陣列操作。
 *
 * 票券 03 的三個 command 只動 doc 的頂層序列（插入一場、搬移一場、換掉一場裡的
 * 一個區塊），用陣列 splice ＋ 重建比 `Slice`／`ReplaceStep` 的開合深度計算單純，
 * 也更好在 Node 裡讀測試。真正要走 `Step` 的是編輯器端與去重 plugin。
 *
 * 子場次（票券 11）之後，「以 `sceneId` 找一場」要兩層都找 —— 走 `findScene`／`replaceScene`。
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

/**
 * 以 `sceneId` 找到的一個場次節點 —— 頂層 `scene` 或某個主場次底下的 `subscene`（票券 11）。
 *
 * 帶著它在樹裡的座標（頂層第幾個、主場次裡第幾個孩子），`replaceScene` 靠它重建 doc。
 * 座標是呼叫當下算出、用完即丟的傳遞值（§5.2 `fragmentIndex` 先例），不被任何東西儲存。
 */
export interface SceneHit {
  readonly node: ProseMirrorNode;
  /** 頂層那一場在 doc 裡的序（子場次的話是它的主場次）。 */
  readonly topIndex: number;
  /** 子場次在主場次裡的孩子序；頂層場次為 `null`。 */
  readonly childIndex: number | null;
  /** 子場次的主場次；頂層場次為 `null`。 */
  readonly parent: ProseMirrorNode | null;
}

/**
 * 以永久 id 找場次，**兩層都找**（深度固定兩層，所以不必遞迴）。
 *
 * 既有 command 一律改走這一支：它們以 `sceneId` 定址，而子場次也是場次（ADR-0003：
 * 「有自己完整的 metadata、自己的永久 id」）—— 寫地點、換區塊型別、寫群演在兩層都成立。
 */
export function findScene(doc: ProseMirrorNode, sceneId: string): SceneHit | null {
  let hit: SceneHit | null = null;
  doc.forEach((top, _offset, topIndex) => {
    if (hit || top.type.name !== "scene") return;
    if (top.attrs.sceneId === sceneId) {
      hit = { node: top, topIndex, childIndex: null, parent: null };
      return;
    }
    top.forEach((child, _o, childIndex) => {
      if (!hit && child.type.name === "subscene" && child.attrs.sceneId === sceneId) {
        hit = { node: child, topIndex, childIndex, parent: top };
      }
    });
  });
  return hit;
}

/**
 * 把 `hit` 那一場換成 `next`（`null` ＝ 整棵拿掉），回傳新的 doc。
 *
 * 不做 schema 檢查以外的事 —— `schema.node()` 建構時會驗內容規則，不合法會 throw，
 * 呼叫端照慣例包成 `reject`。
 */
export function replaceScene(
  doc: ProseMirrorNode,
  hit: SceneHit,
  next: ProseMirrorNode | null,
): ProseMirrorNode {
  const tops = topLevelArray(doc);
  if (hit.parent === null) {
    if (next) tops[hit.topIndex] = next;
    else tops.splice(hit.topIndex, 1);
    return docFrom(tops);
  }
  const kids: ProseMirrorNode[] = [];
  hit.parent.forEach((child) => kids.push(child));
  if (next) kids[hit.childIndex!] = next;
  else kids.splice(hit.childIndex!, 1);
  tops[hit.topIndex] = hit.parent.type.create(hit.parent.attrs, kids, hit.parent.marks);
  return docFrom(tops);
}

/** 換掉一場的 attrs（內容不動）。寫 metadata 的 command 共用。 */
export function withSceneAttrs(
  scene: ProseMirrorNode,
  attrs: Record<string, unknown>,
): ProseMirrorNode {
  return scene.type.create({ ...scene.attrs, ...attrs }, scene.content, scene.marks);
}
