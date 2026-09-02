/**
 * 場次身分（`sceneId`）的鑄造時刻與 doc 走訪工具。
 *
 * **不變式 ⑦（§11、§4.3、[ADR-0002](../../../../docs/adr/0002-scene-id-and-derived-scene-numbers.md)）**：
 * 場次身分只在五個時刻被鑄造，**其餘一切都保住既有 id**。這個模組把「五個時刻」
 * 寫成一份清單，讓 command 與不變式測試共用同一個定義 —— 不在清單上的 command
 * （`moveScene`、`setBlockType`、拖曳、剪下貼上、⌘Z）一律 `mintSceneId()` 都不呼叫。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

/**
 * `sceneId` 只在這五個時刻被鑄造（§4.3）。值是穩定字串，供測試對照與日後的
 * 遙測標記使用；何時真的呼叫 `mintSceneId()` 由對應的 command 決定。
 *
 * | key | 時刻 | 落地票券 |
 * |---|---|---|
 * | `createScene` | `/next`、⌘+Enter、場次腳部按鈕 | 03（`createNextScene`） |
 * | `createSubscene` | `/insert`、`/continue-to` | 11 |
 * | `createGroupMember` | 「對剪到…」第二步選「建立新的一場」 | 12 |
 * | `cloneForCollision` | 複製出一份副本（碰撞修復） | 03（`dedupeSceneIds`） |
 * | `pasteAcrossScreenplays` | 跨劇本貼上 | 04（剪貼簿邊界 `transformPasted`） |
 */
export const MINT_MOMENTS = {
  createScene: "createScene",
  createSubscene: "createSubscene",
  createGroupMember: "createGroupMember",
  cloneForCollision: "cloneForCollision",
  pasteAcrossScreenplays: "pasteAcrossScreenplays",
} as const;

export type MintMoment = (typeof MINT_MOMENTS)[keyof typeof MINT_MOMENTS];

/** doc 頂層子節點 ＋ 它在 doc 裡的位置與序。 */
export interface TopLevelEntry {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly index: number;
}

/**
 * 依文件順序列出 doc 的頂層子節點。
 *
 * 本票券範圍內頂層只有 `scene`；`sceneGroup` 在票券 12 加入，屆時這個函式照樣
 * 回傳它（command 各自決定要不要理它）。
 */
export function topLevelChildren(doc: ProseMirrorNode): TopLevelEntry[] {
  const out: TopLevelEntry[] = [];
  doc.forEach((node, offset, index) => {
    out.push({ node, pos: offset, index });
  });
  return out;
}

/** 頂層 `scene` 節點（帶位置）。 */
export function topLevelScenes(doc: ProseMirrorNode): TopLevelEntry[] {
  return topLevelChildren(doc).filter((e) => e.node.type.name === "scene");
}

/** doc 裡帶 `sceneId` attr 的每個節點（本票券：頂層 `scene`；日後：`subscene`／`groupMember`）。 */
export function sceneIdNodes(doc: ProseMirrorNode): { node: ProseMirrorNode; pos: number }[] {
  const out: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (typeof node.attrs.sceneId === "string") out.push({ node, pos });
  });
  return out;
}

/** doc 裡出現超過一次的 `sceneId`。 */
export function duplicateSceneIds(doc: ProseMirrorNode): string[] {
  const seen = new Map<string, number>();
  for (const { node } of sceneIdNodes(doc)) {
    const id = node.attrs.sceneId as string;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}
