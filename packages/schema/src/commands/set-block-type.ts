/**
 * `setBlockType` —— 改變某個區塊的型別（動作／對白／插入畫面）。
 *
 * 這是 `Tab`／`Shift+Tab` 環的**意圖**；環怎麼排、IME 組字期間不動作那些是**手勢**，
 * 留在編輯器裡（§6.3 意圖 vs 手勢分界表）。
 *
 * **區塊定址**：schema 的 `action`／`dialogue`／`insertShot` 沒有 id（規格 §5.1 節點表
 * 未給），所以用 `{ sceneId, blockIndex }` —— 場次以永久 id 定址，區塊以**呼叫當下算出、
 * 不被儲存的序**定址。這正是 §5.2 給 `assignFragmentToMember(groupId, fragmentIndex, …)`
 * 的 `fragmentIndex` 立下的先例：保護規則 2／3 禁的是**持久化的位置引用**，傳遞參數不在此列。
 *
 * **准入判準（§6.3）**：以 `sceneId` 定址（區塊 index 是傳遞參數）。它不鑄造任何身分，
 * 所在場次的 `sceneId` 原封不動（不變式 ⑦）。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { schema } from "../schema";
import { type CommandResult, ok, reject } from "./result";
import { docFrom, replaceChild, topLevelArray } from "./tree";

/** `sceneBlock` group 的三個成員（規格 §4.6）。 */
export const BLOCK_TYPES = ["action", "dialogue", "insertShot"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface SetBlockTypeOptions {
  readonly sceneId: string;
  /** 場次內第幾個 `sceneBlock`（0-based）。傳遞參數，不被儲存（見檔頭）。 */
  readonly blockIndex: number;
  readonly type: BlockType;
}

export function setBlockType(doc: ProseMirrorNode, options: SetBlockTypeOptions): CommandResult {
  const { sceneId, blockIndex, type } = options;

  if (!BLOCK_TYPES.includes(type)) {
    return reject(`未知的區塊型別「${type}」，只能是 ${BLOCK_TYPES.join("／")}`);
  }

  const children = topLevelArray(doc);
  const sceneIdx = children.findIndex((n) => n.attrs.sceneId === sceneId);
  if (sceneIdx === -1) return reject(`找不到 sceneId「${sceneId}」`);

  const scene = children[sceneIdx]!;
  if (blockIndex < 0 || blockIndex >= scene.childCount) {
    return reject(`場次「${sceneId}」沒有第 ${blockIndex} 個區塊（共 ${scene.childCount} 個）`);
  }

  const block = scene.child(blockIndex);
  if (block.type.name === type) return ok(doc); // 已經是目標型別 —— no-op

  // 保留 inline 內容；不搬 attr（型別換了，`人物`／`發聲方式` 由新節點的 schema 預設補）。
  const nextBlock = schema.node(type, null, block.content);
  const nextScene = replaceChild(scene, blockIndex, nextBlock);

  const nextChildren = [...children];
  nextChildren[sceneIdx] = nextScene;

  try {
    return ok(docFrom(nextChildren));
  } catch (err) {
    return reject(`換區塊型別後 doc 不符 schema：${(err as Error).message}`);
  }
}
