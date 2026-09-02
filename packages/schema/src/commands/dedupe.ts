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

import { mintSceneId } from "../ids";
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

/**
 * 走訪的結果 → 「哪些節點該被改」的清單（依位置排序）。
 *
 * 純判斷、不鑄造、不重建 —— `dedupeSceneIds`（純函式路徑）與 `dedupeIdsPlugin`
 * （transaction 路徑）共用，各自只走一次 `sceneIdNodes(doc)`。
 */
function planRemints(
  entries: readonly { node: ProseMirrorNode; pos: number }[],
  ranges: readonly Range[],
): { node: ProseMirrorNode; pos: number; from: string }[] {
  const groups = new Map<string, { node: ProseMirrorNode; pos: number }[]>();
  for (const entry of entries) {
    const id = entry.node.attrs.sceneId as string;
    let arr = groups.get(id);
    if (!arr) groups.set(id, (arr = []));
    arr.push(entry);
  }

  const plan: { node: ProseMirrorNode; pos: number; from: string }[] = [];
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
      if (o !== keeper) plan.push({ node: o.node, pos: o.pos, from: o.node.attrs.sceneId as string });
    }
  }

  plan.sort((a, b) => a.pos - b.pos);
  return plan;
}

export function dedupeSceneIds(doc: ProseMirrorNode, options: DedupeOptions = {}): DedupeResult {
  const entries = sceneIdNodes(doc);
  const plan = planRemints(entries, options.insertedRanges ?? []);
  if (plan.length === 0) return { changed: false, doc, remints: [] };

  const newIds = new Map<ProseMirrorNode, string>();
  const remints: Remint[] = plan.map(({ node, pos, from }) => {
    const to = mintSceneId();
    newIds.set(node, to);
    return { pos, from, to };
  });

  function rebuild(node: ProseMirrorNode): ProseMirrorNode {
    let out = node;
    if (node.childCount > 0) {
      const kids: ProseMirrorNode[] = [];
      node.forEach((child) => kids.push(rebuild(child)));
      out = node.copy(Fragment.fromArray(kids));
    }
    const to = newIds.get(node);
    if (to !== undefined) {
      out = out.type.create({ ...out.attrs, sceneId: to }, out.content, out.marks);
    }
    return out;
  }

  return { changed: true, doc: rebuild(doc), remints };
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

      const plan = planRemints(
        sceneIdNodes(newState.doc),
        collectInsertedRanges(transactions),
      );
      if (plan.length === 0) return null;

      const tr = newState.tr;
      const remints: Remint[] = [];
      for (const { pos, from } of plan) {
        // setNodeMarkup 不改節點大小 → 依序套用時，plan 裡的位置全程有效。
        const node = tr.doc.nodeAt(pos);
        if (node && typeof node.attrs.sceneId === "string") {
          const to = mintSceneId();
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, sceneId: to });
          remints.push({ pos, from, to });
        }
      }
      if (!tr.steps.length) return null;

      // 模型的修復，不是使用者的動作 —— ⌘Z 不該退回到重複 id 的狀態。
      tr.setMeta("addToHistory", false);
      tr.setMeta(dedupeIdsPluginKey, { remints } satisfies DedupeMeta);
      return tr;
    },
  });
}
