/**
 * 不變式 ⑥ —— **同一份 doc 內 `sceneId` 不得重複**。
 *
 * 分兩層（§6.5、[ADR-0002](../../../../docs/adr/0002-scene-id-and-derived-scene-numbers.md)）：
 *
 * 1. `dedupeSceneIds(doc, { insertedRanges })` —— **純函式**，吃 doc 吐 doc，Node 可測。
 *    只在偵測到重複時動作；改的一律是**本次新插入的那個節點**。呼叫端從 step 的
 *    mapping 算出「新插入的位置區間」傳進來，函式據此挑出要改哪一個。無法判定
 *    （沒給區間、或重複的節點都不在區間內）時，後備規則是**文件順序在前者保留**。
 * 2. `dedupeIdsPlugin()` —— 把同一套判斷接到 ProseMirror 的 `appendTransaction`：
 *    每次 docChanged 後檢查、需要時補一筆 transaction，並標 **`addToHistory: false`**
 *    （否則「複製貼上 → 去重改 id → ⌘Z」會退回到重複 id 的狀態）。plugin 直接用
 *    `setNodeMarkup` 改那幾個節點的 attr（節點大小不變、位置不動），不重建整棵樹。
 *
 * **碰撞本身就是唯一判別器，不必猜使用者意圖**：剪下時原節點離開文件 → 貼上不
 * 碰撞 → 去重不觸發 → id 天然保住；複製時原節點還在 → 貼上必碰撞 → 去重觸發 →
 * 新插入的那份換新 id。
 *
 * `appendTransaction` **永遠不必知道來源** —— 它是最後一道防線，對任何來源都成立
 * （剪貼簿、程式化插入、日後的匯入、我們自己的 bug）。跨劇本貼上要鑄新身分那一半
 * 住在剪貼簿邊界（`transformPasted`，票券 04），不在這裡。
 */
import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type Transaction } from "prosemirror-state";
import { Mapping, type StepMap } from "prosemirror-transform";

import { mintGroupId, mintSceneId } from "../ids";
import { sceneIdNodes } from "./identity";

export const dedupeIdsPluginKey = new PluginKey("scenephonie/dedupeIds");

export interface DedupeMeta {
  readonly remints: ReadonlyArray<Remint>;
}

/** 一筆改寫：某個位置的節點，`sceneId` 從 `from` 換成新鑄的 `to`。 */
export interface Remint {
  readonly pos: number;
  readonly from: string;
  readonly to: string;
}

export interface DedupeResult {
  /** 是否動過手（沒有重複時為 `false`，`doc` 原封回傳）。 */
  readonly changed: boolean;
  readonly doc: ProseMirrorNode;
  readonly remints: ReadonlyArray<Remint>;
}

export interface DedupeOptions {
  /**
   * 「本次新插入」的位置區間（`doc` 座標系）。重複的節點若落在其中一個區間內，
   * 就是它被改；區間外的保留。省略 ＝ 一律套後備規則（文件順序在前者保留）。
   */
  readonly insertedRanges?: ReadonlyArray<{ from: number; to: number }>;
}

type Range = { readonly from: number; readonly to: number };

function inAnyRange(pos: number, ranges: readonly Range[]): boolean {
  return ranges.some((r) => pos >= r.from && pos < r.to);
}

interface Entry {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

/** doc 裡帶 `groupId` attr 的每個節點（頂層 `sceneGroup`）。 */
function groupIdNodes(doc: ProseMirrorNode): Entry[] {
  const out: Entry[] = [];
  doc.forEach((node, pos) => {
    if (typeof node.attrs.groupId === "string") out.push({ node, pos });
  });
  return out;
}

/**
 * 去重適用的兩種 id（§6.5：`scene`、`subscene`、`groupMember`、`sceneGroup` 完全相同處理）。
 * 規則一套，只差 attr 名、怎麼找到帶它的節點、怎麼鑄造。
 */
const ID_ATTRS = [
  { attr: "sceneId", mint: mintSceneId, nodes: sceneIdNodes },
  { attr: "groupId", mint: mintGroupId, nodes: groupIdNodes },
] as const;
type IdAttr = (typeof ID_ATTRS)[number]["attr"];

interface Planned extends Entry {
  readonly attr: IdAttr;
  readonly from: string;
}

/**
 * 走訪的結果 → 「哪些節點該被改」的清單（依位置排序）。
 *
 * 純判斷、不鑄造、不重建 —— `dedupeSceneIds`（純函式路徑）與 `dedupeIdsPlugin`
 * （transaction 路徑）共用，各自只走一次 doc。
 */
function planRemints(doc: ProseMirrorNode, ranges: readonly Range[]): Planned[] {
  const plan: Planned[] = [];
  for (const { attr, nodes } of ID_ATTRS) {
    const entries = nodes(doc);
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const id = entry.node.attrs[attr] as string;
      let arr = groups.get(id);
      if (!arr) groups.set(id, (arr = []));
      arr.push(entry);
    }

    for (const occ of groups.values()) {
      if (occ.length < 2) continue;

      const nonInserted = occ.filter((o) => !inAnyRange(o.pos, ranges));
      // 「新插入的那份換新 id」只有在確實分得出新舊時才套用：有區間、有落在區間外的
      // （保留對象）、且不是全部都在區間外。其餘一律後備規則：保留文件順序第一個。
      const keeper =
        ranges.length > 0 && nonInserted.length > 0 && nonInserted.length < occ.length
          ? nonInserted[0]!
          : occ[0]!;

      for (const o of occ) {
        if (o !== keeper) plan.push({ ...o, attr, from: o.node.attrs[attr] as string });
      }
    }
  }

  plan.sort((a, b) => a.pos - b.pos);
  return plan;
}

const mintFor = (attr: IdAttr) => ID_ATTRS.find((k) => k.attr === attr)!.mint();

/**
 * 群組成員換了 `sceneId`，**同一個群組裡**指向它的片段要跟著換 —— 否則片段會指向另一個群組的
 * 成員（整份群組被複製貼上時正是如此）。回傳「群組節點之前的位置 → 舊 id → 新 id」。
 */
function memberRemaps(doc: ProseMirrorNode, remints: readonly Remint[]): Map<number, Map<string, string>> {
  const byGroup = new Map<number, Map<string, string>>();
  for (const r of remints) {
    const node = doc.nodeAt(r.pos);
    if (node?.type.name !== "groupMember") continue;
    const $pos = doc.resolve(r.pos);
    const groupPos = $pos.before($pos.depth);
    let map = byGroup.get(groupPos);
    if (!map) byGroup.set(groupPos, (map = new Map()));
    map.set(r.from, r.to);
  }
  return byGroup;
}

export function dedupeSceneIds(doc: ProseMirrorNode, options: DedupeOptions = {}): DedupeResult {
  const plan = planRemints(doc, options.insertedRanges ?? []);
  if (plan.length === 0) return { changed: false, doc, remints: [] };

  // 以位置為鍵 —— 同一個節點物件可能在 doc 裡出現兩次（整份複製貼上），以物件為鍵會分不開。
  const updates = new Map<number, Record<string, string>>();
  const remints: Remint[] = plan.map(({ pos, attr, from }) => {
    const to = mintFor(attr);
    updates.set(pos, { ...updates.get(pos), [attr]: to });
    return { pos, from, to };
  });
  const remaps = memberRemaps(doc, remints.filter((_r, i) => plan[i]!.attr === "sceneId"));

  function rebuild(node: ProseMirrorNode, pos: number, memberIds?: Map<string, string>): ProseMirrorNode {
    let out = node;
    if (node.childCount > 0) {
      const kids: ProseMirrorNode[] = [];
      const inner = remaps.get(pos);
      node.forEach((child, offset) => kids.push(rebuild(child, pos + 1 + offset, inner)));
      out = node.copy(Fragment.fromArray(kids));
    }
    const attrs: Record<string, unknown> = { ...updates.get(pos) };
    const memberId = out.attrs.memberId as string | undefined;
    if (memberId && memberIds?.has(memberId)) attrs.memberId = memberIds.get(memberId);
    if (Object.keys(attrs).length > 0) {
      out = out.type.create({ ...out.attrs, ...attrs }, out.content, out.marks);
    }
    return out;
  }

  // doc 本身沒有「之前的位置」；孩子從 0 起算，所以傳 -1 讓 `pos + 1 + offset` 落在 offset。
  return { changed: true, doc: rebuild(doc, -1), remints };
}

/** 把每個 transaction 的每個 step map 的「插入片段」映射到最終 doc 座標系。 */
function collectInsertedRanges(transactions: readonly Transaction[]): Range[] {
  const maps: StepMap[] = [];
  for (const tr of transactions) maps.push(...tr.mapping.maps);

  const ranges: Range[] = [];
  maps.forEach((map, i) => {
    const rest = new Mapping(maps.slice(i + 1));
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (newEnd <= newStart) return; // 純刪除，沒有新插入的片段
      ranges.push({ from: rest.map(newStart, -1), to: rest.map(newEnd, 1) });
    });
  });
  return ranges;
}

export function dedupeIdsPlugin(): Plugin {
  return new Plugin({
    key: dedupeIdsPluginKey,
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const plan = planRemints(newState.doc, collectInsertedRanges(transactions));
      if (plan.length === 0) return null;

      const tr = newState.tr;
      const remints: Remint[] = [];
      const memberRemints: Remint[] = [];
      for (const { pos, attr, from } of plan) {
        // setNodeMarkup 不改節點大小 → 依序套用時，plan 裡的位置全程有效。
        const node = tr.doc.nodeAt(pos);
        if (node && node.attrs[attr] === from) {
          const to = mintFor(attr);
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: to });
          const remint = { pos, from, to };
          remints.push(remint);
          if (attr === "sceneId") memberRemints.push(remint);
        }
      }
      // 換了 id 的成員，同群組裡指向它的片段跟著換（見 `memberRemaps`）。
      for (const [groupPos, ids] of memberRemaps(tr.doc, memberRemints)) {
        const group = tr.doc.nodeAt(groupPos)!;
        group.forEach((child, offset) => {
          const memberId = child.attrs.memberId as string | undefined;
          if (!memberId || !ids.has(memberId)) return;
          tr.setNodeMarkup(groupPos + 1 + offset, undefined, { ...child.attrs, memberId: ids.get(memberId) });
        });
      }
      if (!tr.steps.length) return null;

      // 模型的修復，不是使用者的動作 —— ⌘Z 不該退回到重複 id 的狀態。
      tr.setMeta("addToHistory", false);
      tr.setMeta(dedupeIdsPluginKey, { remints } satisfies DedupeMeta);
      return tr;
    },
  });
}
