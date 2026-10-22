/**
 * 落點解析（票券 13、§7.5）—— 拖曳的**手勢**那一半：「拖的是什麼 × 滑到哪個落點的哪一半」→
 * 要送哪一支 kernel command，或 `null`（**那個位置不畫落點線**）。
 *
 * 合法性**不在這裡重寫一套規則**，一律拿 kernel command 試跑一次：被拒絕、或跑完什麼都沒變（放回
 * 原地）就是 `null`。落點線與 command 的拒絕因此永遠講同一套話 —— 縱深是「UI 先擋滑鼠、command
 * 擋其餘」，不是兩份會漂移的規則（§6.3 意圖 vs 手勢）。
 *
 * 落點是**依位置計算**的，不再是「同 kind 才收」（§7.5 成本 4）：
 *
 * | 落點 | 區塊 | 場次（主場次或子場次） | 群組 |
 * |---|---|---|---|
 * | 區塊的上／下半 | 同一段內容裡、它之前／之後 | 放進那段內容（主場次降級、子場次換住處） | — |
 * | 子場次的外框 | 主場次裡、子場次之前／之後 | 同左 | — |
 * | 主場次的外框 | — | 頂層、它之前／之後（子場次升級） | 同左 |
 * | 群組的外框 | — | 頂層、群組之前／之後 | 同左 |
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  moveBlock,
  moveGroup,
  moveScene,
  type CommandResult,
  type ContainerAddress,
  type MoveBlockOptions,
  type MoveGroupOptions,
  type MoveSceneOptions,
  type SubsceneKind,
} from "@scenephonie/schema";

import type { BlockAddress } from "./address";

/** 拖起來的那一個。場次不分主場次與子場次 —— 是升級、降級還是平移，看落點。 */
export type DragPayload =
  | { readonly kind: "block"; readonly from: BlockAddress }
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "group"; readonly groupId: string };

/** 滑鼠底下的那個落點（最內層的那一個）。`index` 是它在所屬那段內容裡的孩子序。 */
export type DropZone =
  | { readonly kind: "block"; readonly container: ContainerAddress; readonly index: number }
  | { readonly kind: "subscene"; readonly sceneId: string; readonly host: ContainerAddress; readonly index: number }
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "group"; readonly groupId: string };

export type DropSide = "before" | "after";

export type DropIntent =
  | { readonly command: "moveBlock"; readonly options: MoveBlockOptions }
  /** `demote` ＝ 主場次要變成子場次 —— 放下時得先問編劇種類，`options.kind` 那時才補上。 */
  | { readonly command: "moveScene"; readonly options: MoveSceneOptions; readonly demote: boolean }
  | { readonly command: "moveGroup"; readonly options: MoveGroupOptions };

/** 把意圖交給 kernel 跑（降級時帶編劇選的種類）。 */
export function runIntent(doc: PMNode, intent: DropIntent, kind?: SubsceneKind): CommandResult {
  switch (intent.command) {
    case "moveBlock":
      return moveBlock(doc, intent.options);
    case "moveGroup":
      return moveGroup(doc, intent.options);
    case "moveScene":
      return moveScene(doc, kind ? { ...intent.options, kind } : intent.options);
  }
}

function topLevelTarget(zone: DropZone, side: DropSide) {
  if (zone.kind === "scene") return { position: side, refSceneId: zone.sceneId } as const;
  if (zone.kind === "group") return { position: side, refGroupId: zone.groupId } as const;
  return null;
}

/** 落點在一段內容裡指的是哪個孩子位置（區塊或子場次的上／下半）；頂層落點回 `null`。 */
function insideSlot(zone: DropZone, side: DropSide) {
  const shift = side === "after" ? 1 : 0;
  if (zone.kind === "block") return { ...zone.container, index: zone.index + shift };
  if (zone.kind === "subscene") return { ...zone.host, index: zone.index + shift };
  return null;
}

function intentFor(doc: PMNode, payload: DragPayload, zone: DropZone, side: DropSide): DropIntent | null {
  const slot = insideSlot(zone, side);
  const top = topLevelTarget(zone, side);

  if (payload.kind === "block") {
    return slot ? { command: "moveBlock", options: { from: payload.from, to: slot } } : null;
  }
  if (payload.kind === "group") {
    return top ? { command: "moveGroup", options: { groupId: payload.groupId, target: top } } : null;
  }
  const { sceneId } = payload;
  if (top) return { command: "moveScene", options: { sceneId, target: top }, demote: false };
  let isTopLevel = false;
  doc.forEach((n) => {
    if (n.type.name === "scene" && n.attrs.sceneId === sceneId) isTopLevel = true;
  });
  return {
    command: "moveScene",
    options: { sceneId, target: { position: "inside", ...slot! } },
    demote: isTopLevel,
  };
}

/**
 * 這次拖曳在這個落點的這一半要做什麼；`null` ＝ 不合法或放回原地，**不畫落點線**。
 * `doc` 是 kernel schema 的節點（試跑 command 用）。降級的種類以「插入」試跑 —— 兩種種類的合法
 * 位置完全相同，真正的種類在放下時才問。
 */
export function resolveDrop(
  doc: PMNode,
  payload: DragPayload,
  zone: DropZone,
  side: DropSide,
): DropIntent | null {
  const intent = intentFor(doc, payload, zone, side);
  if (!intent) return null;
  const tried = runIntent(doc, intent, "插入");
  if (!tried.ok || tried.value.eq(doc)) return null;
  return intent;
}
