/**
 * 定址 —— 場次以永久 id、區塊以「呼叫當下算出、不被儲存的序」（§6.3 / §5.2 的 `fragmentIndex`
 * 先例）。這個走訪在多個擴充裡重複出現，所以收在這一處。
 *
 * **子場次也是場次**（票券 11、ADR-0003）：它有自己的永久 id，裡面的區塊以**子場次的** id ＋
 * 在子場次裡的序定址。主場次裡的子場次本身佔主場次的一個孩子序，但它不是區塊。
 *
 * **群組成員也是場次，但它沒有自己的內容**（票券 12、ADR-0004）：內容在片段裡，而片段沒有 id。
 * 片段裡的區塊因此以**成員的** id ＋ `fragmentIndex`（群組裡第幾個片段）＋ 在片段裡的序定址 ——
 * kernel 的 `ContainerAddress` 同一個形狀。
 */
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

/** 帶 metadata、以 `sceneId` 定址的三種節點。 */
export const SCENE_NODE_TYPES: ReadonlySet<string> = new Set(["scene", "subscene", "groupMember"]);

export const isSceneNode = (node: PMNode): boolean => SCENE_NODE_TYPES.has(node.type.name);

/**
 * 孩子是區塊（與子場次）的三種節點 —— 游標能站的地方一定在其中一種裡面。主場次、子場次是
 * 場次本身；片段是群組成員的一段內容。
 */
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["scene", "subscene", "groupFragment"]);

/** 一個區塊的定址：所在場次的永久 id（片段裡再加 `fragmentIndex`）＋ 它在那段內容裡的序。傳遞用，不被持久化。 */
export interface BlockAddress {
  readonly sceneId: string;
  /** 群組裡第幾個片段 —— 只有區塊住在片段裡時才有（`sceneId` 是那個片段的成員）。 */
  readonly fragmentIndex?: number;
  readonly blockIndex: number;
}

export interface SceneContext extends BlockAddress {
  /**
   * `$pos` 座標系裡**內容容器**（主場次、子場次或片段）的 depth —— `select-scope` 要用它算
   * `$pos.before(sceneDepth)`。片段的話它不是場次節點本身（成員是 atom，沒有內容）。
   */
  readonly sceneDepth: number;
}

/** 群組節點裡，第 `index` 個孩子是第幾個片段（成員排在片段之前，內容規則 `groupMember* groupFragment*`）。 */
export function fragmentIndexOf(group: PMNode, index: number): number {
  let members = 0;
  group.forEach((child) => {
    if (child.type.name === "groupMember") members++;
  });
  return index - members;
}

/** 群組節點裡的成員（依順序）—— `⌘+1`／`⌘+2`／`⌘+3` 的定址表。 */
export function groupMembersOf(group: PMNode): PMNode[] {
  const out: PMNode[] = [];
  group.forEach((child) => {
    if (child.type.name === "groupMember") out.push(child);
  });
  return out;
}

/**
 * 從一個落在場次內的 `$pos` 反推它所在的場次與區塊序 —— **最內層**的那一段內容（在子場次裡就是
 * 子場次，在片段裡就是那個片段 ＋ 它的成員）。
 *
 * 對「游標在區塊內文」與「`getPos()` 給的『區塊之前』」兩種 `$pos` 都成立：前者 depth 較深、
 * 迴圈往上找到場次；後者 `$pos.depth` 已是場次 depth，`$pos.index($pos.depth)` 就是區塊序。
 */
export function sceneContext($pos: ResolvedPos): SceneContext | null {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (!CONTAINER_TYPES.has(node.type.name)) continue;
    if (node.type.name === "groupFragment") {
      return {
        sceneId: node.attrs.memberId as string,
        fragmentIndex: fragmentIndexOf($pos.node(d - 1), $pos.index(d - 1)),
        sceneDepth: d,
        blockIndex: $pos.index(d),
      };
    }
    return {
      sceneId: node.attrs.sceneId as string,
      sceneDepth: d,
      blockIndex: $pos.index(d),
    };
  }
  return null;
}

/** 從 `SceneContext` 取出傳給 command 的那一份定址（不帶 depth）。 */
export function blockAddressOf(ctx: SceneContext): BlockAddress {
  return ctx.fragmentIndex == null
    ? { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex }
    : { sceneId: ctx.sceneId, fragmentIndex: ctx.fragmentIndex, blockIndex: ctx.blockIndex };
}

/** 兩個定址指的是不是同一個區塊。 */
export function sameBlock(a: BlockAddress, b: BlockAddress): boolean {
  return (
    a.sceneId === b.sceneId &&
    (a.fragmentIndex ?? null) === (b.fragmentIndex ?? null) &&
    a.blockIndex === b.blockIndex
  );
}

/**
 * 依文件順序走過每一場（主場次，接著它底下的子場次；群組裡先走成員，再走片段裡的子場次）。
 * `pos` 是節點之前的座標。回 `false` 就停。
 */
export function forEachScene(doc: PMNode, visit: (node: PMNode, pos: number) => boolean | void) {
  let stopped = false;
  doc.descendants((node, pos) => {
    if (stopped || node.isTextblock) return false;
    if (isSceneNode(node) && visit(node, pos) === false) stopped = true;
    // 往下只走到裝得下場次的那幾層：主場次（子場次）、群組（成員與片段）、片段（子場次）。
    return !stopped && (node.type.name === "scene" || node.type.name === "sceneGroup" || node.type.name === "groupFragment");
  });
}

/** 以 `sceneId` 找場次（主場次、子場次或成員）與它在 doc 裡的位置（節點之前）。 */
export function findSceneNode(doc: PMNode, sceneId: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  forEachScene(doc, (node, pos) => {
    if (node.attrs.sceneId !== sceneId) return;
    found = { node, pos };
    return false;
  });
  return found;
}

/**
 * 以定址找**那段內容**（主場次、子場次或片段）與它在 doc 裡的位置（節點之前）。片段的話
 * `fragmentIndex` 指的那一段必須屬於 `sceneId` 那個成員。
 */
export function findContainerNode(
  doc: PMNode,
  address: Pick<BlockAddress, "sceneId" | "fragmentIndex">,
): { node: PMNode; pos: number } | null {
  const hit = findSceneNode(doc, address.sceneId);
  if (!hit) return null;
  if (hit.node.type.name !== "groupMember") return address.fragmentIndex == null ? hit : null;
  if (address.fragmentIndex == null) return null;

  const $member = doc.resolve(hit.pos);
  const group = $member.parent;
  const groupStart = $member.start();
  let found: { node: PMNode; pos: number } | null = null;
  group.forEach((child, offset, index) => {
    if (found || child.type.name !== "groupFragment") return;
    if (fragmentIndexOf(group, index) !== address.fragmentIndex) return;
    if (child.attrs.memberId === address.sceneId) found = { node: child, pos: groupStart + offset };
  });
  return found;
}

/** doc 裡每一場（主場次、子場次與成員）的 `sceneId`，依文件順序。 */
export function allSceneIds(doc: PMNode): string[] {
  const ids: string[] = [];
  forEachScene(doc, (node) => {
    ids.push(node.attrs.sceneId as string);
  });
  return ids;
}

/**
 * 成員 `sceneId` 的第一個片段的內文起點（doc 座標）—— 成員沒有自己的內文，「進它的內文」就是
 * 進它的第一段。它一段片段都沒有、或不是成員時回 `null`。
 */
export function firstFragmentText(doc: PMNode, sceneId: string): number | null {
  const member = findSceneNode(doc, sceneId);
  if (!member || member.node.type.name !== "groupMember") return null;
  const $member = doc.resolve(member.pos);
  let at: number | null = null;
  $member.parent.forEach((child, offset) => {
    if (at == null && child.type.name === "groupFragment" && child.attrs.memberId === sceneId) {
      at = $member.start() + offset + 2; // 進片段、進首區塊（片段不以子場次開頭）
    }
  });
  return at;
}
