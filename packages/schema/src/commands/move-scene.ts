/**
 * `moveScene` —— 把一個場次搬到另一個位置，**可以跨層**（票券 13、§7.5）。
 *
 * 這是拖曳 ⠿ 與「點場次號 → 搬移到…」的**意圖**；拖曳時哪些落點不畫指示線是**手勢**。
 *
 * **`moveScene` 自己也要拒絕非法目標**（§6.3、[ADR-0007](../../../../docs/adr/0007-document-as-single-authority.md)
 * 最後一列）—— 縱深不是重複：UI 的落點線是滑鼠層的預防，command 的拒絕是模型層的保證，
 * 擋得住伺服器端呼叫與日後的 API。
 *
 * 跨層的兩個方向都**無損**：`sceneId` 與 metadata 全程存活，變的只有推導出來的場次號。
 * - **升級**：子場次搬到頂層 → 變成主場次（`種類` 拿掉 —— 主場次沒有與誰的關係可宣告）。
 * - **降級**：主場次搬進另一場的內容裡 → 變成子場次。`種類` 由呼叫端給（編劇在放下時選的），
 *   系統不代填；**帶著子場次的主場次不能降級**（會生出第三層，不變式 ⑤）。
 *
 * **准入判準（§6.3）**：以 `sceneId` 定址；搬移全程保住 `sceneId`（不變式 ⑦ —— 搬移
 * 不是鑄造時刻）；放進場次內容時守不變式 ①（插入點之前要有主場次自己的內容）。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { schema, type SubsceneKind } from "../schema";
import { opensBefore } from "../subscenes";
import { checked } from "./checked";
import { type CommandResult, reject } from "./result";
import {
  childrenOf,
  docFrom,
  findContainer,
  findScene,
  indexAfterRemoval,
  replaceAt,
  samePath,
  topLevelArray,
  type ContainerAddress,
} from "./tree";

/** 頂層序列裡的落點：某一場（或某個群組）之前／之後，或整份的頭尾。 */
export type TopLevelTarget =
  | { readonly position: "before" | "after"; readonly refSceneId: string }
  | { readonly position: "before" | "after"; readonly refGroupId: string }
  | { readonly position: "start" }
  | { readonly position: "end" };

/**
 * 一段場次內容（主場次或片段）裡的落點：放進去之後成為那段內容的第 `index` 個孩子。
 * `index` 以**搬移前**的那段內容計，同一段內容裡搬時由 command 自己扣掉來源（傳遞參數，§5.2）。
 */
export interface InsideTarget extends ContainerAddress {
  readonly position: "inside";
  readonly index: number;
}

export type MoveTarget = TopLevelTarget | InsideTarget;

export interface MoveSceneOptions {
  readonly sceneId: string;
  readonly target: MoveTarget;
  /** 降級（主場次放進場次內容）時編劇選的種類 —— 必填、系統不代填。其餘情形不看這個值。 */
  readonly kind?: SubsceneKind;
}

/** 子場次升級成主場次：attrs 去掉子場次才有的 `種類`，內容原封不動。 */
function asScene(node: ProseMirrorNode): ProseMirrorNode {
  const attrs = { ...node.attrs };
  delete attrs.kind;
  return schema.node("scene", attrs, node.content);
}

/**
 * 在頂層序列（已拿掉搬移的那一個）裡找落點的序；找不到參考回一句理由。
 * 參考只認頂層 —— 子場次與群組成員不是頂層序列的一員。
 */
function topLevelIndex(
  children: readonly ProseMirrorNode[],
  target: TopLevelTarget,
): number | string {
  if (target.position === "start") return 0;
  if (target.position === "end") return children.length;
  const idx =
    "refSceneId" in target
      ? children.findIndex((n) => n.type.name === "scene" && n.attrs.sceneId === target.refSceneId)
      : children.findIndex((n) => n.type.name === "sceneGroup" && n.attrs.groupId === target.refGroupId);
  if (idx === -1) {
    const ref = "refSceneId" in target ? `sceneId「${target.refSceneId}」` : `groupId「${target.refGroupId}」`;
    return `非法目標：頂層找不到參考 ${ref}`;
  }
  return target.position === "before" ? idx : idx + 1;
}

export function moveScene(doc: ProseMirrorNode, options: MoveSceneOptions): CommandResult {
  const { sceneId, target } = options;
  if ("refSceneId" in target && target.refSceneId === sceneId) {
    return reject("非法目標：不能把場次搬到相對於它自己的位置");
  }

  const hit = findScene(doc, sceneId);
  if (!hit) return reject(`找不到要搬移的 sceneId「${sceneId}」`);
  if (hit.node.type.name === "groupMember") {
    return reject("群組成員不能單獨搬移 —— 加入／離開群組走對剪與解除群組");
  }

  // 先拆下來，再放回去：拆完之後一切定址都在中間那份 doc 上重新找，序不必手算位移。
  const rest = replaceAt(doc, hit.path, null);
  if (target.position === "inside") return moveInside(doc, rest, hit, options, target);

  const moved = hit.node.type.name === "subscene" ? asScene(hit.node) : hit.node;

  const children = topLevelArray(rest);
  const at = topLevelIndex(children, target);
  if (typeof at === "string") return reject(at);
  children.splice(at, 0, moved);

  return checked(() => docFrom(children));
}

function moveInside(
  doc: ProseMirrorNode,
  rest: ProseMirrorNode,
  hit: NonNullable<ReturnType<typeof findScene>>,
  options: MoveSceneOptions,
  target: InsideTarget,
): CommandResult {
  const at = findContainer(rest, target);
  if (typeof at === "string") return reject(`非法目標：${at}`);
  if (!at.hostsSubscenes) return reject("非法目標：子場次裡不能再放子場次（深度固定兩層，不變式 ⑤）");

  let moved = hit.node;
  if (hit.node.type.name === "scene") {
    if (childrenOf(hit.node).some((n) => n.type.name === "subscene")) {
      return reject("非法目標：帶著子場次的主場次不能放進另一場 —— 會生出第三層（不變式 ⑤）");
    }
    if (!options.kind) return reject("主場次降級成子場次要指明種類（插入／接續）—— 系統不代填");
    moved = schema.node("subscene", { ...hit.node.attrs, kind: options.kind }, hit.node.content);
  }

  const before = findContainer(doc, target);
  const sameContainer =
    typeof before !== "string" && hit.containerPath != null && samePath(before.path, hit.containerPath);
  const index = indexAfterRemoval(target.index, sameContainer ? hit.path[hit.path.length - 1]! : null);
  if (index < 0 || index > at.node.childCount) {
    return reject(`非法目標：那段內容沒有第 ${target.index} 個位置`);
  }
  if (!opensBefore(at.node, index)) {
    return reject("非法目標：主場次的內容必須以主場次自己的內容開始 —— 子場次不能放在它之前（不變式 ①）");
  }

  const kids = childrenOf(at.node);
  kids.splice(index, 0, moved);
  return checked(() => replaceAt(rest, at.path, at.node.type.create(at.node.attrs, kids, at.node.marks)));
}

export interface MoveGroupOptions {
  readonly groupId: string;
  readonly target: TopLevelTarget;
}

/**
 * `moveGroup` —— 場次群組在頂層**整體**搬移（票券 13）。成員、片段、`groupId` 與每個成員的
 * `sceneId` 原封不動；成員單獨進出群組不走拖曳，走對剪與解除群組。以 `groupId` 定址。
 */
export function moveGroup(doc: ProseMirrorNode, options: MoveGroupOptions): CommandResult {
  const { groupId, target } = options;
  if ("refGroupId" in target && target.refGroupId === groupId) {
    return reject("非法目標：不能把群組搬到相對於它自己的位置");
  }
  const children = topLevelArray(doc);
  const from = children.findIndex((n) => n.type.name === "sceneGroup" && n.attrs.groupId === groupId);
  if (from === -1) return reject(`找不到要搬移的 groupId「${groupId}」`);
  const [group] = children.splice(from, 1);

  const at = topLevelIndex(children, target);
  if (typeof at === "string") return reject(at);
  children.splice(at, 0, group!);
  return checked(() => docFrom(children));
}
