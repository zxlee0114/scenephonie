/**
 * 對白帶著群演離開原場次（票券 13，使用者驗收 2026-10-22）。
 *
 * 對白的人物欄可以指「本場的群演」（§5.1），群演是場次限定實體 —— 區塊搬到別場（拖曳、剪下貼上、
 * 拖走選取的文字）時，引用跟著走、定義沒有：那顆 chip 在新的那場指不到任何東西，點它改字還會把
 * 說話者整個弄丟。這裡把定義補進對白現在所在的那一場：
 * - 文件裡還找得到那一筆（原場次）就**複製**它 —— 同一個 `extraId`、描述與人數照舊。群演 id 只在
 *   場次內有意義（§6.5 群演不去重），兩場各一筆不衝突；原場次那一筆留著，它仍是那一場的 metadata。
 * - 哪裡都找不到（從別份劇本貼來）就以顯示名補一筆，人數「若干」—— 系統不替編劇編一個數字。
 *
 * `moveBlock` 在 command 裡做（kernel 產出的 doc 不留懸空引用）；貼上與拖放走編輯器原生的
 * replace，由 `adoptExtrasPlugin` 在 appendTransaction 補 —— 兩邊共用 `planAdoption`。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { ReplaceStep, Transform } from "prosemirror-transform";

import { dialogueCharacters } from "../entities";
import { isExtraId, sceneExtras } from "../extras";
import type { ExtraRef } from "../schema";

interface Adoption {
  /** 擁有群演的那個節點（主場次、子場次或群組成員）的位置。 */
  readonly pos: number;
  /** 補完之後那個節點的整份群演。 */
  readonly extras: ExtraRef[];
}

/** 文件裡每一筆群演的定義（同一個 id 有好幾筆時取文件順序第一筆）。 */
function knownExtras(docs: readonly ProseMirrorNode[]): Map<string, ExtraRef> {
  const known = new Map<string, ExtraRef>();
  for (const doc of docs) {
    doc.descendants((node) => {
      if (node.isTextblock) return false;
      for (const extra of sceneExtras(node.attrs.extras)) if (!known.has(extra.extraId)) known.set(extra.extraId, extra);
      return true;
    });
  }
  return known;
}

/** 每一個對白所屬的那一場要補哪幾筆群演。`sources`：去哪裡找定義（預設就是 `doc` 自己）。 */
function planAdoption(doc: ProseMirrorNode, sources: readonly ProseMirrorNode[] = [doc]): Adoption[] {
  let known: Map<string, ExtraRef> | null = null;
  const plan = new Map<number, ExtraRef[]>();
  doc.descendants((node, pos) => {
    if (node.type.name !== "dialogue") return !node.isTextblock;
    const strays = dialogueCharacters(node.attrs.character).filter((ref) => isExtraId(ref.id));
    if (strays.length === 0) return false;

    // 擁有者：主場次／子場次就是外面那一層；片段的群演住在它所屬的成員上。
    const $pos = doc.resolve(pos);
    const container = $pos.parent;
    let ownerPos: number | null = $pos.depth > 0 ? $pos.before() : null;
    if (container.type.name === "groupFragment") {
      ownerPos = null;
      $pos.node(-1).forEach((child, offset) => {
        if (child.type.name === "groupMember" && child.attrs.sceneId === container.attrs.memberId) {
          ownerPos = $pos.before(-1) + 1 + offset;
        }
      });
    }
    if (ownerPos == null) return false;
    const owner = doc.nodeAt(ownerPos)!;
    const extras = plan.get(ownerPos) ?? sceneExtras(owner.attrs.extras);
    let changed = false;
    for (const ref of strays) {
      if (extras.some((e) => e.extraId === ref.id)) continue;
      known ??= knownExtras(sources);
      extras.push(known.get(ref.id) ?? { extraId: ref.id, description: ref.displayName, countValue: { kind: "some" } });
      changed = true;
    }
    if (changed || plan.has(ownerPos)) plan.set(ownerPos, extras);
    return false;
  });
  return [...plan].map(([pos, extras]) => ({ pos, extras }));
}

function apply(tr: Transform, plan: readonly Adoption[]): void {
  // setNodeMarkup 不改節點大小 → 依序套用時，plan 裡的位置全程有效。
  for (const { pos, extras } of plan) tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, extras });
}

/** 補上懸空的群演定義；沒有要補的就原樣回傳同一個 doc。 */
export function adoptStrayExtras(doc: ProseMirrorNode, sources: readonly ProseMirrorNode[] = [doc]): ProseMirrorNode {
  const plan = planAdoption(doc, sources);
  if (plan.length === 0) return doc;
  const tr = new Transform(doc);
  apply(tr, plan);
  return tr.doc;
}

export const adoptExtrasPluginKey = new PluginKey("scenephonie/adoptExtras");

/** 這筆 transaction 有沒有把對白放進文件（打字、改 attr 都不會 —— 不必每一顆鍵都掃整份）。 */
const insertsDialogue = (steps: readonly unknown[]) =>
  steps.some((step) => {
    if (!(step instanceof ReplaceStep)) return false;
    let found = false;
    step.slice.content.descendants((node) => {
      if (node.type.name === "dialogue") found = true;
      return !found && !node.isTextblock;
    });
    return found;
  });

/**
 * 貼上、拖放之後補群演定義。跟觸發它的那一筆同一個 ⌘Z（history 把 appendTransaction 併進同一步）：
 * 復原時兩者一起退，不會留下一個沒人用的群演。定義從貼上前的文件找得到也算（剪下之後原場次可能已經空了）。
 */
export function adoptExtrasPlugin(): Plugin {
  return new Plugin({
    key: adoptExtrasPluginKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged && insertsDialogue(tr.steps))) return null;
      const plan = planAdoption(newState.doc, [newState.doc, oldState.doc]);
      if (plan.length === 0) return null;
      const tr = newState.tr;
      apply(tr, plan);
      return tr.setMeta(adoptExtrasPluginKey, true);
    },
  });
}
