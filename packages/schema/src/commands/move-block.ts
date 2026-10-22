/**
 * `moveBlock` —— 把一個區塊搬到另一段場次內容裡，**可以跨場次、跨層**（票券 13、§7.5）。
 *
 * 區塊沒有 id：來源與落點都是「場次的 `sceneId`（片段再加 `fragmentIndex`）＋ 序」，呼叫當下由
 * 編輯器從拖曳算出、不被儲存的傳遞參數（§5.2 `fragmentIndex` 先例）。
 *
 * **准入判準（§6.3）**：以 `sceneId` 定址；守住兩條拖曳特有的結構後果 ——
 * 1. 搬走一段內容的**最後一個區塊**：那段內容不刪，補一個空的動作區塊（場次留在原地，只是空了）；
 * 2. 階層化的變體：**主場次自己最後一個區塊被拖走、只剩子場次** —— 同樣在最前面補一個空的動作
 *    區塊，主場次才不會以子場次開頭（不變式 ①）。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { schema } from "../schema";
import { checked } from "./checked";
import { type CommandResult, reject } from "./result";
import {
  childrenOf,
  findContainer,
  indexAfterRemoval,
  replaceAt,
  samePath,
  type ContainerAddress,
} from "./tree";

export interface BlockLocation extends ContainerAddress {
  readonly blockIndex: number;
}

export interface BlockDestination extends ContainerAddress {
  /** 放進去之後成為那段內容的第 `index` 個孩子；以**搬移前**的那段內容計。 */
  readonly index: number;
}

export interface MoveBlockOptions {
  readonly from: BlockLocation;
  readonly to: BlockDestination;
}

interface Plan {
  readonly build: () => ProseMirrorNode;
  /** 搬完（含補位）之後，搬過去的那一個在哪。 */
  readonly landing: BlockLocation;
}

function plan(doc: ProseMirrorNode, options: MoveBlockOptions): Plan | string {
  const { from, to } = options;
  const source = findContainer(doc, from);
  if (typeof source === "string") return source;
  const moved = from.blockIndex >= 0 && from.blockIndex < source.node.childCount
    ? source.node.child(from.blockIndex)
    : null;
  if (!moved?.isTextblock) return `場次「${from.sceneId}」沒有第 ${from.blockIndex} 個區塊`;

  const rest = replaceAt(doc, [...source.path, from.blockIndex], null);
  const at = findContainer(rest, to);
  if (typeof at === "string") return `非法目標：${at}`;

  const sameContainer = samePath(source.path, at.path);
  const index = indexAfterRemoval(to.index, sameContainer ? from.blockIndex : null);
  if (index < 0 || index > at.node.childCount) return `非法目標：那段內容沒有第 ${to.index} 個位置`;

  const kids = childrenOf(at.node);
  kids.splice(index, 0, moved);
  // 同一段內容裡搬、放好之後打頭的是子場次：`reopen` 會在最前面補一格，搬過去的那一個跟著往後。
  const blockIndex = sameContainer && kids[0]!.type.name === "subscene" ? index + 1 : index;
  return {
    build: () => reopen(replaceAt(rest, at.path, at.node.type.create(at.node.attrs, kids, at.node.marks)), from),
    landing:
      to.fragmentIndex == null
        ? { sceneId: to.sceneId, blockIndex }
        : { sceneId: to.sceneId, fragmentIndex: to.fragmentIndex, blockIndex },
  };
}

export function moveBlock(doc: ProseMirrorNode, options: MoveBlockOptions): CommandResult {
  const planned = plan(doc, options);
  return typeof planned === "string" ? reject(planned) : checked(planned.build);
}

/**
 * `deleteBlock` —— 刪掉一個區塊（點區塊把手的選單，票券 13）。結構後果同搬走：那段內容空了或只剩
 * 子場次打頭時，在最前面補一個空的動作區塊 —— 場次本身不跟著消失（刪場次是 `deleteScene`）。
 */
export function deleteBlock(doc: ProseMirrorNode, at: BlockLocation): CommandResult {
  const hit = findContainer(doc, at);
  if (typeof hit === "string") return reject(hit);
  const node = at.blockIndex >= 0 && at.blockIndex < hit.node.childCount ? hit.node.child(at.blockIndex) : null;
  if (!node?.isTextblock) return reject(`場次「${at.sceneId}」沒有第 ${at.blockIndex} 個區塊`);
  return checked(() => reopen(replaceAt(doc, [...hit.path, at.blockIndex], null), at));
}

/**
 * 搬完之後，搬過去的那個區塊在哪（以搬移**後**的 doc 計）—— 編輯器把游標放在那裡。
 * 搬不動（`moveBlock` 會拒絕）回 `null`。
 */
export function movedBlockLocation(doc: ProseMirrorNode, options: MoveBlockOptions): BlockLocation | null {
  const planned = plan(doc, options);
  return typeof planned !== "string" && checked(planned.build).ok ? planned.landing : null;
}

/**
 * 來源那段內容被搬空、或只剩子場次打頭時，在最前面補一個空的動作區塊（沿用原型 `moveNode`）。
 * 在**放好之後**才補：同一段內容裡搬的話，補不補要看落點落在哪。
 */
function reopen(doc: ProseMirrorNode, address: ContainerAddress): ProseMirrorNode {
  const hit = findContainer(doc, address);
  if (typeof hit === "string") return doc;
  const first = hit.node.firstChild;
  if (first && first.type.name !== "subscene") return doc;
  const kids = [schema.node("action", null, []), ...childrenOf(hit.node)];
  return replaceAt(doc, hit.path, hit.node.type.create(hit.node.attrs, kids, hit.node.marks));
}
