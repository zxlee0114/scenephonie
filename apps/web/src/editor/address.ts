/**
 * 定址 —— 場次以永久 id、區塊以「呼叫當下算出、不被儲存的序」（§6.3 / §5.2 的 `fragmentIndex`
 * 先例）。這個走訪在多個擴充裡重複出現，所以收在這一處。
 *
 * **子場次也是場次**（票券 11、ADR-0003）：它有自己的永久 id，裡面的區塊以**子場次的** id ＋
 * 在子場次裡的序定址。主場次裡的子場次本身佔主場次的一個孩子序，但它不是區塊。
 */
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

/** 帶 metadata、以 `sceneId` 定址的兩種節點。 */
export const SCENE_NODE_TYPES: ReadonlySet<string> = new Set(["scene", "subscene"]);

export const isSceneNode = (node: PMNode): boolean => SCENE_NODE_TYPES.has(node.type.name);

/** 一個區塊的定址：所在場次的永久 id ＋ 它在場次裡的序。傳遞用，不被持久化。 */
export interface BlockAddress {
  readonly sceneId: string;
  readonly blockIndex: number;
}

export interface SceneContext extends BlockAddress {
  /** `$pos` 座標系裡場次節點的 depth —— `select-scope` 要用它算 `$pos.before(sceneDepth)`。 */
  readonly sceneDepth: number;
}

/**
 * 從一個落在場次內的 `$pos` 反推它所在的場次與區塊序 —— **最內層**的那一場（在子場次裡就是
 * 子場次）。
 *
 * 對「游標在區塊內文」與「`getPos()` 給的『區塊之前』」兩種 `$pos` 都成立：前者 depth 較深、
 * 迴圈往上找到場次；後者 `$pos.depth` 已是場次 depth，`$pos.index($pos.depth)` 就是區塊序。
 */
export function sceneContext($pos: ResolvedPos): SceneContext | null {
  for (let d = $pos.depth; d > 0; d--) {
    if (isSceneNode($pos.node(d))) {
      return {
        sceneId: $pos.node(d).attrs.sceneId as string,
        sceneDepth: d,
        blockIndex: $pos.index(d),
      };
    }
  }
  return null;
}

/** 以 `sceneId` 找場次（主場次或子場次）與它在 doc 裡的位置（節點之前）。 */
export function findSceneNode(doc: PMNode, sceneId: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (isSceneNode(node)) {
      if (node.attrs.sceneId === sceneId) found = { node, pos };
      return node.type.name === "scene"; // 子場次裡不會再有場次（深度兩層）
    }
    return false; // 區塊裡沒有場次
  });
  return found;
}

/** doc 裡每一場（主場次與子場次）的 `sceneId`，依文件順序。 */
export function allSceneIds(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.descendants((node) => {
    if (!isSceneNode(node)) return false;
    ids.push(node.attrs.sceneId as string);
    return node.type.name === "scene";
  });
  return ids;
}
