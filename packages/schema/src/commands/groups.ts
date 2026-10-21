/**
 * 場次群組的建立、片段歸屬與正規化（票券 12、§4.5／§5.2、[ADR-0004](../../../../docs/adr/0004-scene-groups-for-intercut.md)）。
 *
 * **建立是重手勢、切換是輕手勢，兩者分開**：
 *
 * | 手勢 | command | 鑄造 |
 * |---|---|---|
 * | `/` →「對剪到…」 | `intercutTo` | 第二步選「建立新的一場」時鑄 `createGroupMember`；選既有場次是**收編**，不鑄 |
 * | `⌘+1`／`⌘+2`／`⌘+3` | `assignFragmentToMember` | 永不鑄造 —— 超出成員數的鍵沒有成員可指，command 拒絕 |
 *
 * 片段沒有 id（ADR-0006 保護規則 3）：`fragmentIndex`／`fromBlockIndex` 是呼叫當下由編輯器從
 * 游標算出的傳遞參數，**不被任何東西儲存**。
 */
import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";

import { mintGroupId, mintSceneId } from "../ids";
import { schema } from "../schema";
import { sameSpaceTime } from "../subscenes";
import { type CommandResult, ok, reject } from "./result";
import {
  childrenOf,
  docFrom,
  findScene,
  groupFragments,
  groupMembers,
  replaceAt,
  topLevelArray,
  type ContainerAddress,
} from "./tree";

export interface IntercutOptions extends ContainerAddress {
  /**
   * 游標所在的那一場：頂層場次（就地變成成員 1）、群組成員（加入那個群組，再給 `fragmentIndex`
   * 決定新片段接在哪一段之後），或它們的子場次（＝在它的主場次裡按）。
   */
  readonly sceneId: string;
  /**
   * 第二步的選擇：`null` ＝「建立新的一場」（鑄造，metadata 全空）；既有頂層場次的 id ＝
   * **收編**它（保住 `sceneId` 與 metadata，原本的內容變成它的第一個片段）。
   */
  readonly withSceneId: string | null;
}

const emptyFragment = (memberId: string) =>
  schema.node("groupFragment", { memberId }, schema.node("action", null, []));

/** `scene` → 同 id 同 metadata 的成員；內容另外變成片段。 */
const asMember = (scene: ProseMirrorNode) => schema.node("groupMember", scene.attrs);

interface IntercutPlan {
  /** 群組（或要變成群組的那一場）在頂層的序。 */
  readonly topIndex: number;
  /** 在群組裡按的話，新片段接在第幾個片段之後；建立新群組時為 `null`。 */
  readonly afterFragment: number | null;
  /** 收編的那一場在頂層的序；建立新的一場時為 `null`。 */
  readonly adoptIndex: number | null;
}

function planIntercut(doc: ProseMirrorNode, options: IntercutOptions): IntercutPlan | string {
  const hit = findScene(doc, options.sceneId);
  if (!hit) return `找不到 sceneId「${options.sceneId}」`;

  let afterFragment: number | null = null;
  const top = doc.child(hit.path[0]!);
  if (top.type.name === "sceneGroup") {
    const members = groupMembers(top).length;
    const fragments = groupFragments(top).length;
    // 在成員的子場次裡按：片段序從子場次的住處取；否則用呼叫端給的（省略 ＝ 最後一段之後）。
    const fromPath = hit.containerPath ? hit.containerPath[1]! - members : null;
    afterFragment = fromPath ?? options.fragmentIndex ?? fragments - 1;
    if (afterFragment < 0 || afterFragment >= fragments) {
      return `群組沒有第 ${afterFragment} 個片段（共 ${fragments} 個）`;
    }
    // 同 `ContainerAddress` 的契約：呼叫端給的那一段必須屬於 `sceneId` 那個成員。
    if (fromPath == null && options.fragmentIndex != null) {
      const owner = groupFragments(top)[afterFragment]!.attrs.memberId;
      if (owner !== options.sceneId) return `第 ${afterFragment} 個片段不屬於成員「${options.sceneId}」`;
    }
  }

  let adoptIndex: number | null = null;
  if (options.withSceneId != null) {
    const adopt = findScene(doc, options.withSceneId);
    if (!adopt) return `找不到要收編的場次「${options.withSceneId}」`;
    if (adopt.path.length !== 1 || adopt.node.type.name !== "scene") {
      return "只能收編頂層場次 —— 一個場次不能同時屬於兩個群組（不變式 ④），子場次不在場次序列上";
    }
    if (adopt.path[0] === hit.path[0]) return "不能把一場跟它自己對剪";
    const already = top.type.name === "sceneGroup" ? groupMembers(top) : [top];
    if (already.some((m) => sameSpaceTime(m, adopt.node))) {
      return "同地點、同時間的兩場是同一場戲 —— 不能對剪";
    }
    adoptIndex = adopt.path[0]!;
  }
  return { topIndex: hit.path[0]!, afterFragment, adoptIndex };
}

/** 「對剪到…」在這個位置、對這個選擇可不可用（選單據此決定列不列出來）。 */
export function canIntercut(doc: ProseMirrorNode, options: IntercutOptions): boolean {
  return typeof planIntercut(doc, options) !== "string";
}

/**
 * `/` →「對剪到…」：建立群組，或在群組裡加入一個成員。
 *
 * 編劇通常是**寫到一半才發現**要對剪（票券 15）—— 所以目前這一場就地變成成員 1、已寫的內容
 * 變成片段 1，同一個指令服務事前規劃與事後發現。群組留在目前這一場原本的位置；收編的那一場
 * 離開頂層序列（它的頂層號跟著群組走）。
 */
export function intercutTo(doc: ProseMirrorNode, options: IntercutOptions): CommandResult {
  const where = planIntercut(doc, options);
  if (typeof where === "string") return reject(where);

  const tops = topLevelArray(doc);
  const adopted = where.adoptIndex == null ? null : tops[where.adoptIndex]!;
  // 成員與它的第一個片段。新的一場：鑄造（`createGroupMember`），metadata 全走 schema 預設 ——
  // 「同時發生」不是交叉場次的定義，所以「metadata 完全不繼承」完整適用（§4.5）。
  const member = adopted
    ? asMember(adopted)
    : schema.node("groupMember", { sceneId: mintSceneId() });
  const memberId = member.attrs.sceneId as string;
  const fragment = adopted
    ? schema.node("groupFragment", { memberId }, adopted.content)
    : emptyFragment(memberId);

  const current = tops[where.topIndex]!;
  let group: ProseMirrorNode;
  if (current.type.name === "scene") {
    const first = schema.node("groupFragment", { memberId: current.attrs.sceneId }, current.content);
    group = schema.node("sceneGroup", { groupId: mintGroupId() }, [
      asMember(current),
      member,
      first,
      fragment,
    ]);
  } else {
    const members = [...groupMembers(current), member];
    const fragments = groupFragments(current);
    fragments.splice(where.afterFragment! + 1, 0, fragment);
    group = rebuildGroup(current, members, fragments);
  }

  tops[where.topIndex] = group;
  if (where.adoptIndex != null) tops.splice(where.adoptIndex, 1);
  try {
    return ok(docFrom(tops));
  } catch (err) {
    return reject(`對剪後 doc 不符 schema：${(err as Error).message}`);
  }
}

export interface AssignFragmentOptions {
  readonly groupId: string;
  /** 群組裡第幾個片段（0-based）。傳遞參數，不被儲存。 */
  readonly fragmentIndex: number;
  /**
   * 從片段的第幾個孩子開始改歸屬（省略 ＝ 0，整段）。中間的話**從那一行切開**：那一截（含其後）
   * 歸給 `memberId`，前一截留給原本的成員。游標在剛按 Enter 開的空行上 ＝ 開一個新片段。
   */
  readonly fromBlockIndex?: number;
  /** 要歸給哪個成員 —— 必須是這個群組的成員（以 id 定址，不以「第幾個成員」定址）。 */
  readonly memberId: string;
}

function findGroup(doc: ProseMirrorNode, groupId: string): number {
  let at = -1;
  doc.forEach((node, _o, i) => {
    if (at < 0 && node.type.name === "sceneGroup" && node.attrs.groupId === groupId) at = i;
  });
  return at;
}

/** 同一個群組（attrs 不變）換一組成員與片段 —— 成員在前、片段在後（內容規則 `groupMember* groupFragment*`）。 */
function rebuildGroup(
  group: ProseMirrorNode,
  members: readonly ProseMirrorNode[],
  fragments: readonly ProseMirrorNode[],
): ProseMirrorNode {
  return group.type.create(group.attrs, [...members, ...fragments], group.marks);
}

/** 相鄰兩段片段該不該併成一段 —— 純函式路徑與 plugin 共用同一個判準。 */
const sameOwner = (a: ProseMirrorNode, b: ProseMirrorNode) => a.attrs.memberId === b.attrs.memberId;

/** 把一個群組裡相鄰、同成員的片段併起來（其餘原封不動；沒有可併的就回原節點）。 */
function mergeGroup(group: ProseMirrorNode): ProseMirrorNode {
  const members = groupMembers(group);
  const merged: ProseMirrorNode[] = [];
  let changed = false;
  for (const fragment of groupFragments(group)) {
    const prev = merged[merged.length - 1];
    if (prev && sameOwner(prev, fragment)) {
      merged[merged.length - 1] = prev.copy(prev.content.append(fragment.content));
      changed = true;
    } else {
      merged.push(fragment);
    }
  }
  return changed ? rebuildGroup(group, members, merged) : group;
}

/**
 * `⌘+1`／`⌘+2`／`⌘+3`：切換游標所在片段的歸屬。**直接定址** —— 超出成員數的鍵在編輯器那一層
 * 就沒有 `memberId` 可傳；即使傳了一個不是本群組成員的 id，這裡也拒絕，**永遠不會憑空建立場次**。
 */
export function assignFragmentToMember(
  doc: ProseMirrorNode,
  options: AssignFragmentOptions,
): CommandResult {
  const { groupId, fragmentIndex, memberId } = options;
  const from = options.fromBlockIndex ?? 0;

  const topIndex = findGroup(doc, groupId);
  if (topIndex < 0) return reject(`找不到 groupId「${groupId}」`);
  const group = doc.child(topIndex);
  const members = groupMembers(group);
  if (!members.some((m) => m.attrs.sceneId === memberId)) {
    return reject(`「${memberId}」不是這個群組的成員 —— 切換歸屬不會建立場次`);
  }
  const fragments = groupFragments(group);
  const fragment = fragments[fragmentIndex];
  if (!fragment) return reject(`群組沒有第 ${fragmentIndex} 個片段（共 ${fragments.length} 個）`);
  if (from < 0 || from >= fragment.childCount) {
    return reject(`片段沒有第 ${from} 個孩子（共 ${fragment.childCount} 個）`);
  }
  if (fragment.child(from).type.name === "subscene") {
    return reject("片段要以成員自己的內容開始 —— 不能從子場次切開（同不變式 ①）");
  }

  const kids = childrenOf(fragment);
  const pieces =
    from === 0
      ? [fragment.type.create({ memberId }, fragment.content)]
      : [
          fragment.copy(Fragment.fromArray(kids.slice(0, from))),
          fragment.type.create({ memberId }, kids.slice(from)),
        ];
  fragments.splice(fragmentIndex, 1, ...pieces);

  try {
    const next = mergeGroup(rebuildGroup(group, members, fragments));
    return ok(replaceAt(doc, [topIndex], next));
  } catch (err) {
    return reject(`切換片段歸屬後 doc 不符 schema：${(err as Error).message}`);
  }
}

const normalizeFragmentsPluginKey = new PluginKey("scenephonie/normalizeFragments");

/**
 * 片段的正規化（§5.2），接在 `appendTransaction`：任何來源（刪掉夾在中間的片段、貼上、⌘Z、我們
 * 自己的 bug）留下的不正規形狀都補一筆修復，標 **`addToHistory: false`** —— 理由與去重相同，它不是
 * 使用者的動作，是模型的修復。兩件事：
 *
 * 1. **孤兒片段**（`memberId` 不是本群組成員 —— 單一片段被貼進別的群組時就是這樣）歸給**前一段**
 *    的成員（第一段就歸給第一個成員）。片段不能不屬於任何成員；接在誰後面就讀作誰的延續，
 *    寫錯了編劇用 `⌘+N` 一鍵改掉。
 * 2. **相鄰同成員**的片段 `join` 成一段。那個區別在模型裡沒有意義，而 ADR-0006 寫下的重疊群組
 *    遷移路徑假設片段是極大的。
 */
export function normalizeFragmentsPlugin(): Plugin {
  return new Plugin({
    key: normalizeFragmentsPluginKey,
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const tr = newState.tr;

      // ① 孤兒：setNodeMarkup 不改節點大小，位置全程有效。
      newState.doc.forEach((top, topPos) => {
        if (top.type.name !== "sceneGroup") return;
        const members = groupMembers(top).map((m) => m.attrs.sceneId as string);
        let prevOwner: string | null = null;
        top.forEach((child, offset) => {
          if (child.type.name !== "groupFragment") return;
          let owner = child.attrs.memberId as string;
          if (!members.includes(owner) && members.length > 0) {
            owner = prevOwner ?? members[0]!;
            tr.setNodeMarkup(topPos + 1 + offset, undefined, { ...child.attrs, memberId: owner });
          }
          prevOwner = owner;
        });
      });

      // ② 相鄰同成員：兩段之間的邊界位置（前一段之後 ＝ 後一段之前）。由後往前 join，前面的位置不受影響。
      const joins: number[] = [];
      tr.doc.forEach((top, topPos) => {
        if (top.type.name !== "sceneGroup") return;
        let prev: ProseMirrorNode | null = null;
        top.forEach((child, offset) => {
          const isFragment = child.type.name === "groupFragment";
          if (isFragment && prev && sameOwner(prev, child)) joins.push(topPos + 1 + offset);
          prev = isFragment ? child : null;
        });
      });
      for (const pos of joins.reverse()) tr.join(pos);

      if (!tr.steps.length) return null;
      tr.setMeta("addToHistory", false);
      return tr;
    },
  });
}

/** 成員變回普通場次：同 id 同 metadata，它的片段依閱讀順序接起來（一段都沒有就是一場空的）。 */
function memberAsScene(group: ProseMirrorNode, member: ProseMirrorNode): ProseMirrorNode {
  const content = groupFragments(group)
    .filter((f) => f.attrs.memberId === member.attrs.sceneId)
    .reduce((acc, f) => acc.append(f.content), Fragment.empty);
  return schema.node("scene", member.attrs, content.size > 0 ? content : schema.node("action", null, []));
}

/**
 * 少了 `sceneId` 那個成員（連同它的片段）之後的群組。
 *
 * 群組少於兩個成員就不是對剪了 —— 只剩一個時**解散**：那個成員變回普通場次。剩下的成員一段
 * 片段都沒有時給一個空的，群組不能沒有可以寫字的地方。
 */
function groupWithout(group: ProseMirrorNode, sceneId: string): ProseMirrorNode {
  const members = groupMembers(group).filter((m) => m.attrs.sceneId !== sceneId);
  if (members.length === 1) return memberAsScene(group, members[0]!);
  let fragments = groupFragments(group).filter((f) => f.attrs.memberId !== sceneId);
  if (fragments.length === 0) fragments = [emptyFragment(members[0]!.attrs.sceneId as string)];
  return mergeGroup(rebuildGroup(group, members, fragments));
}

/** 刪掉一個群組成員（`deleteScene` 的群組分支）：它的片段一起走。 */
export function removeGroupMember(
  doc: ProseMirrorNode,
  topIndex: number,
  sceneId: string,
): ProseMirrorNode {
  return replaceAt(doc, [topIndex], groupWithout(doc.child(topIndex), sceneId));
}

export interface UngroupMemberOptions {
  /** 要移出對剪的那個成員。 */
  readonly sceneId: string;
}

/**
 * 成員選單「移出對剪」：那一場離開群組、變回普通場次，**接在群組後面**；`sceneId`、metadata、
 * 子場次都保住，它散在群組各處的片段依閱讀順序接成它的內文。其餘成員之間的交錯不動；只剩一個
 * 成員時群組也解散（同刪除）。
 */
export function ungroupMember(doc: ProseMirrorNode, options: UngroupMemberOptions): CommandResult {
  const hit = findScene(doc, options.sceneId);
  if (!hit) return reject(`找不到 sceneId「${options.sceneId}」`);
  if (hit.node.type.name !== "groupMember") return reject(`「${options.sceneId}」不是群組成員`);

  const topIndex = hit.path[0]!;
  const group = doc.child(topIndex);
  const tops = topLevelArray(doc);
  tops.splice(topIndex, 1, groupWithout(group, options.sceneId), memberAsScene(group, hit.node));
  try {
    return ok(docFrom(tops));
  } catch (err) {
    return reject(`移出對剪後 doc 不符 schema：${(err as Error).message}`);
  }
}

export interface DissolveGroupOptions {
  readonly groupId: string;
}

/**
 * 「解散對剪」：整個群組拆掉，每個成員依成員順序變回普通場次，各自的片段依閱讀順序接起來。
 * 交錯全部消失 —— ⌘Z 一步整組回來。
 */
export function dissolveGroup(doc: ProseMirrorNode, options: DissolveGroupOptions): CommandResult {
  const topIndex = findGroup(doc, options.groupId);
  if (topIndex < 0) return reject(`找不到 groupId「${options.groupId}」`);
  const group = doc.child(topIndex);
  const tops = topLevelArray(doc);
  tops.splice(topIndex, 1, ...groupMembers(group).map((m) => memberAsScene(group, m)));
  try {
    return ok(docFrom(tops));
  } catch (err) {
    return reject(`解散對剪後 doc 不符 schema：${(err as Error).message}`);
  }
}
