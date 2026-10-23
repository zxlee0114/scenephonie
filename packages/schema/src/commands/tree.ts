/**
 * doc 樹的不可變操作。
 *
 * 票券 03 的三個 command 只動 doc 的頂層序列（插入一場、搬移一場、換掉一場裡的
 * 一個區塊），用陣列 splice ＋ 重建比 `Slice`／`ReplaceStep` 的開合深度計算單純，
 * 也更好在 Node 裡讀測試。真正要走 `Step` 的是編輯器端與去重 plugin。
 *
 * 子場次（票券 11）與場次群組（票券 12）之後，場次可能住在三種地方：頂層（`scene`）、群組裡
 * （`groupMember`）、主場次或片段裡（`subscene`）。「以 `sceneId` 找一場」走 `findScene`，
 * 「找一段可以放區塊的內容」走 `findContainer`，改完一律以 `path` 重建（`replaceAt`）。
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

/** 一個節點的孩子展開成陣列。 */
export function childrenOf(node: ProseMirrorNode): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];
  node.forEach((child) => out.push(child));
  return out;
}

/** 換掉某個父節點的第 `index` 個子節點，回傳新的父節點（type／attrs／marks 不變）。 */
export function replaceChild(
  parent: ProseMirrorNode,
  index: number,
  next: ProseMirrorNode,
): ProseMirrorNode {
  const children = childrenOf(parent);
  children[index] = next;
  return parent.type.create(parent.attrs, children, parent.marks);
}

/**
 * 從 doc 往下的孩子序 —— `[3]` 是頂層第 4 個，`[3, 5, 0]` 是它的第 6 個孩子的第 1 個孩子。
 * 呼叫當下算出、用完即丟的傳遞值（§5.2 `fragmentIndex` 先例），不被任何東西儲存。
 */
export type TreePath = readonly number[];

/**
 * 把 `path` 那個節點換成 `next`（`null` ＝ 拿掉），沿路重建祖先，回傳新的 doc。
 *
 * 不做 schema 檢查以外的事 —— `schema.node()`／`type.create()` 建構時會驗內容規則，不合法會
 * throw，呼叫端照慣例包成 `reject`。
 */
export function replaceAt(
  doc: ProseMirrorNode,
  path: TreePath,
  next: ProseMirrorNode | null,
): ProseMirrorNode {
  const rebuild = (parent: ProseMirrorNode, depth: number): ProseMirrorNode => {
    const index = path[depth]!;
    const kids = childrenOf(parent);
    if (depth === path.length - 1) {
      if (next) kids[index] = next;
      else kids.splice(index, 1);
    } else {
      kids[index] = rebuild(kids[index]!, depth + 1);
    }
    return parent.type.create(parent.attrs, kids, parent.marks);
  };
  return rebuild(doc, 0);
}

export const samePath = (a: TreePath, b: TreePath): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * 「先拆下來、再放回去」的落點序：`index` 以**搬移前**計（呼叫端看到的就是那份），來源若在同一段
 * 內容裡、排在落點之前，拆下來之後落點就往前一格。`removedAt` ＝ 來源在同一段內容裡的序，不在
 * 同一段就是 `null`。
 */
export function indexAfterRemoval(index: number, removedAt: number | null): number {
  return removedAt != null && index > removedAt ? index - 1 : index;
}

/**
 * 以 `sceneId` 找到的一個場次節點 —— 頂層 `scene`、群組裡的 `groupMember`，或某個主場次／
 * 片段底下的 `subscene`。
 */
export interface SceneHit {
  readonly node: ProseMirrorNode;
  readonly path: TreePath;
  /**
   * 子場次的**主場次** —— `scene`，或片段所屬的那個 `groupMember`（成員可以有自己的子場次）。
   * 主場次與成員本身為 `null`。不變式 ② 比的就是這一場。
   */
  readonly owner: ProseMirrorNode | null;
  /** 子場次住在哪一段內容裡（主場次或片段）的 path；主場次與成員為 `null`。 */
  readonly containerPath: TreePath | null;
}

/** 一個群組裡的成員（依順序）。 */
export function groupMembers(group: ProseMirrorNode): ProseMirrorNode[] {
  return childrenOf(group).filter((n) => n.type.name === "groupMember");
}

/** 一個群組裡的片段（依順序）。`fragmentIndex` 就是在這個陣列裡的序。 */
export function groupFragments(group: ProseMirrorNode): ProseMirrorNode[] {
  return childrenOf(group).filter((n) => n.type.name === "groupFragment");
}

/**
 * 以永久 id 找場次，**三種住處都找**（深度固定：頂層 → 群組 → 片段 → 子場次，不必遞迴）。
 *
 * 既有 command 一律走這一支：它們以 `sceneId` 定址，而子場次與成員也是場次（ADR-0003／0004：
 * 「有自己完整的 metadata、自己的永久 id」）—— 寫地點、寫群演在每一種場次上都成立。
 */
export function findScene(doc: ProseMirrorNode, sceneId: string): SceneHit | null {
  let hit: SceneHit | null = null;
  const scanSubscenes = (container: ProseMirrorNode, path: TreePath, owner: ProseMirrorNode) => {
    container.forEach((child, _o, i) => {
      if (!hit && child.type.name === "subscene" && child.attrs.sceneId === sceneId) {
        hit = { node: child, path: [...path, i], owner, containerPath: path };
      }
    });
  };

  doc.forEach((top, _offset, topIndex) => {
    if (hit) return;
    if (top.type.name === "scene") {
      if (top.attrs.sceneId === sceneId) {
        hit = { node: top, path: [topIndex], owner: null, containerPath: null };
        return;
      }
      scanSubscenes(top, [topIndex], top);
      return;
    }
    if (top.type.name !== "sceneGroup") return;
    const members = groupMembers(top);
    top.forEach((child, _o, i) => {
      if (hit) return;
      if (child.type.name === "groupMember" && child.attrs.sceneId === sceneId) {
        hit = { node: child, path: [topIndex, i], owner: null, containerPath: null };
      } else if (child.type.name === "groupFragment") {
        const owner = members.find((m) => m.attrs.sceneId === child.attrs.memberId);
        if (owner) scanSubscenes(child, [topIndex, i], owner);
      }
    });
  });
  return hit;
}

/** 把 `hit` 那一場換成 `next`（`null` ＝ 整棵拿掉），回傳新的 doc。 */
export function replaceScene(
  doc: ProseMirrorNode,
  hit: SceneHit,
  next: ProseMirrorNode | null,
): ProseMirrorNode {
  return replaceAt(doc, hit.path, next);
}

/** 換掉一場的 attrs（內容不動）。寫 metadata 的 command 共用。 */
export function withSceneAttrs(
  scene: ProseMirrorNode,
  attrs: Record<string, unknown>,
): ProseMirrorNode {
  return scene.type.create({ ...scene.attrs, ...attrs }, scene.content, scene.marks);
}

/**
 * 一段**可以放區塊的內容**的定址：場次的 `sceneId`，在群組成員身上再加一個 `fragmentIndex`。
 *
 * 成員沒有自己的內容（內容在片段裡），而片段沒有 id（ADR-0006 保護規則 3）—— 所以「成員的第幾
 * 段」只能是**群組裡第幾個片段**，呼叫當下由編輯器從游標算出、不被任何東西儲存（§5.2）。
 */
export interface ContainerAddress {
  readonly sceneId: string;
  /** 群組裡第幾個片段（0-based）。只有 `sceneId` 是群組成員時才給，而且那個片段必須屬於它。 */
  readonly fragmentIndex?: number;
}

export interface ContainerHit {
  /** `scene`、`subscene` 或 `groupFragment` —— 孩子是區塊（與子場次）的那個節點。 */
  readonly node: ProseMirrorNode;
  readonly path: TreePath;
  /** 這段內容的 metadata 屬於哪一場（片段的話是它的成員）。 */
  readonly owner: ProseMirrorNode;
  /** 這段內容是不是**主場次那一層**（`scene` 或片段）—— 只有那一層能裝子場次。 */
  readonly hostsSubscenes: boolean;
}

/** 以 `ContainerAddress` 找內容容器；找不到回一句給人讀的理由。 */
export function findContainer(
  doc: ProseMirrorNode,
  address: ContainerAddress,
): ContainerHit | string {
  const { sceneId, fragmentIndex } = address;
  const hit = findScene(doc, sceneId);
  if (!hit) return `找不到 sceneId「${sceneId}」`;

  if (hit.node.type.name !== "groupMember") {
    if (fragmentIndex != null) return `場次「${sceneId}」不是群組成員，沒有片段可定址`;
    return {
      node: hit.node,
      path: hit.path,
      owner: hit.node,
      hostsSubscenes: hit.node.type.name === "scene",
    };
  }

  if (fragmentIndex == null) return `成員場次「${sceneId}」沒有自己的內容 —— 要指明第幾個片段`;
  const groupPath = hit.path.slice(0, -1);
  const group = doc.child(groupPath[0]!);
  const members = groupMembers(group).length;
  const fragments = groupFragments(group);
  const fragment = fragments[fragmentIndex];
  if (!fragment) {
    return `群組沒有第 ${fragmentIndex} 個片段（共 ${fragments.length} 個）`;
  }
  if (fragment.attrs.memberId !== sceneId) {
    return `第 ${fragmentIndex} 個片段不屬於成員「${sceneId}」`;
  }
  return {
    node: fragment,
    path: [...groupPath, members + fragmentIndex],
    owner: hit.node,
    hostsSubscenes: true,
  };
}
