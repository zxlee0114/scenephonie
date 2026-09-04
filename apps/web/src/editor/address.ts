/**
 * 定址 —— 場次以永久 id、區塊以「呼叫當下算出、不被儲存的序」（§6.3 / §5.2 的 `fragmentIndex`
 * 先例）。這個走訪在多個擴充裡重複出現；子場次落地（票券 11）時只需要改這一處。
 */
import type { ResolvedPos } from "@tiptap/pm/model";

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
 * 從一個落在場次內的 `$pos` 反推它所在的場次與區塊序。
 *
 * 對「游標在區塊內文」與「`getPos()` 給的『區塊之前』」兩種 `$pos` 都成立：前者 depth 較深、
 * 迴圈往上找到場次；後者 `$pos.depth` 已是場次 depth，`$pos.index($pos.depth)` 就是區塊序。
 */
export function sceneContext($pos: ResolvedPos): SceneContext | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "scene") {
      return {
        sceneId: $pos.node(d).attrs.sceneId as string,
        sceneDepth: d,
        blockIndex: $pos.index(d),
      };
    }
  }
  return null;
}
