/**
 * `projectScenes(doc)` —— 從 doc 推導場次的顯示序號。
 *
 * **純函式，Node 與瀏覽器都能跑**（§5.4）。場次表、PDF 匯出、唯讀分享各自呼叫它；
 * 編輯器也一樣（只是還得包一層 ProseMirror decoration 讓 node view 知道重繪）。
 *
 * **推導值不進 doc、不進 DB**：場次號在系統裡從來不是 key——約束 1 說下游一律掛
 * `sceneId`，沒有任何查詢用場次號 join。它只在渲染那一刻有意義，就該在渲染時才算。
 *
 * **範圍**：頂層 `scene` 依文件順序編 `1..N`；子場次（票券 11）編 `5.1`（父場次號 ＋ 點號 ＋
 * 該父場次底下第幾個子場次），緊接在主場次之後。群組成員（票券 12）各佔一個頂層號、群組本身
 * 不佔號；成員的子場次散在它的各個片段裡，依文件順序編在它底下。草稿（票券 14）跳號另編
 * `S11[D1]` —— 草稿判定也在這一次走訪裡：PDF、場次表、匯出前草稿清單共用同一次走訪（§6.4），
 * 不會長出兩套會分歧的實作。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { groupMembers } from "./commands/tree";
import { echoingMembers } from "./groups";
import { isSceneMetaIncomplete } from "./scene-meta";
import { schema } from "./schema";
import { sameSpaceTime, subsceneEchoesParent } from "./subscenes";

export interface SceneNumber {
  /** 場次的永久識別碼（`sc_` 前綴）。下游關聯掛這個，不掛序號。 */
  sceneId: string;
  /**
   * 依文件順序推導的顯示序號，`1..N`。子場次是它主場次的號碼；草稿是它錨定的那個正式場次的
   * 頂層號（全劇第一個正式場次之前是 `0`）。呈現用標籤，重排時會變。
   */
  number: number;
  /**
   * 印出來的樣子：主場次 `"5"`、子場次 `"5.1"`（點號，不是連字號 —— 連字號是鏡號的慣例）、
   * 草稿 `"S5[D1]"`／`"S5.1[D1]"`（錨定前一個正式場次；排在全劇第一場之前是 `"[D1]"`）。
   * ⚠️ 任何東西都不准引用它，只能引用 `sceneId`（ADR-0006 保護規則 2）。
   */
  label: string;
  /**
   * 是不是草稿（票券 14，§4.8）—— **推導的，不是存的**：`manualDraft` 或 metadata 不完整。
   * 草稿不佔正式場次號，**不進 PDF、不進場次表**（交付投影各自濾掉 `draft` 的列）。
   */
  draft: boolean;
  /** 子場次的主場次（或成員）；主場次為 `undefined`。 */
  parentSceneId?: string;
  /** 群組成員所屬群組的 `groupId`（票券 12）；不是成員為 `undefined`。 */
  groupId?: string;
}

/**
 * 依文件順序把正式場次推導成 `1..N`，子場次緊接在主場次之後編 `N.1`、`N.2`…；草稿跳過，
 * 另編 `S11[D1]`。
 *
 * **草稿的判定**（§4.8，三條自動草稿不變式全部接到「metadata 不完整」，零新機制）：
 *
 * | 誰 | 是草稿，如果 |
 * |---|---|
 * | 每一場 | `manualDraft`，或 metadata 有空欄（雜景的地點欄除外，`isSceneMetaIncomplete`） |
 * | 子場次 | 另外：主場次（或成員）是草稿；或 metadata 與它**完全相同**（不變式 ②） |
 * | 群組成員 | 另外：與另一個成員 metadata **完全相同**（不變式 ③），或**同地同時**（③ 的寬鬆版，票券 12 驗收） |
 *
 * 子場次可以單獨是草稿而主場次不是。草稿標籤**錨定前一個正式場次**（錨定後一場會與真正的
 * `S12` 撞號），而且**錨在自己的層級**（使用者裁決 2026-10-21）：頂層草稿錨前一個正式頂層號
 * （`5`、`5.1` 之後是 `S5[D1]`，不是 `S5.1[D1]` —— 那會被讀成 5.1 底下的草稿）；草稿子場次錨
 * 主場次裡前一個正式子場次（`S5.1[D1]`），還沒有就錨主場次本身。見 `numberer`。
 *
 * 群組成員的子場次散在片段裡，依**成員順序**編（同正式子場次號），所以錨的是自己成員的上一個
 * 正式號，不是閱讀順序上的前一段。
 *
 * @param doc 已 hydrate 的 ProseMirror doc 節點（用本模組的 `schema`；見 `docFromJSON`）。
 */
export function projectScenes(doc: ProseMirrorNode): SceneNumber[] {
  const numbers: SceneNumber[] = [];
  const next = numberer();

  const ownDraft = (scene: ProseMirrorNode) =>
    scene.attrs.manualDraft === true || isSceneMetaIncomplete(scene);

  /** 一個頂層場次：它自己，接著散在 `containers` 裡的子場次。 */
  const number = (
    scene: ProseMirrorNode,
    containers: ProseMirrorNode[],
    draft: boolean,
    groupId?: string,
  ) => {
    const sceneId = scene.attrs.sceneId as string;
    numbers.push({ sceneId, ...next.topLevel(draft), draft, ...(groupId ? { groupId } : {}) });
    for (const container of containers) {
      container.forEach((child) => {
        if (child.type.name !== "subscene") return;
        const childDraft = draft || ownDraft(child) || subsceneEchoesParent(scene, child);
        numbers.push({
          sceneId: child.attrs.sceneId as string,
          ...next.subscene(childDraft),
          draft: childDraft,
          parentSceneId: sceneId,
        });
      });
    }
  };

  doc.forEach((node) => {
    if (node.type.name === "scene") {
      number(node, [node], ownDraft(node));
      return;
    }
    if (node.type.name !== "sceneGroup") return;
    const groupId = node.attrs.groupId as string;
    const members = groupMembers(node);
    const echoing = new Set(echoingMembers(node));
    const fragments: ProseMirrorNode[] = [];
    node.forEach((child) => {
      if (child.type.name === "groupFragment") fragments.push(child);
    });
    for (const member of members) {
      const sceneId = member.attrs.sceneId as string;
      const draft =
        ownDraft(member) ||
        echoing.has(sceneId) ||
        members.some((other) => other !== member && sameSpaceTime(member, other));
      const own = fragments.filter((f) => f.attrs.memberId === sceneId);
      number(member, own, draft, groupId);
    }
  });
  return numbers;
}

/**
 * 編號器：依走訪順序發號。正式場次編 `1..N`／`N.1`…；草稿依它的錨點編 `[Dn]`，同一個錨點底下
 * 的草稿共用一條 `D` 序列（頂層草稿與主場次的第一個草稿子場次都錨 `5` 時是 `S5[D1]`、`S5[D2]`），
 * 所以標籤不會撞。
 */
function numberer() {
  let top = 0;
  let sub = 0;
  /** 前一個正式頂層場次的標籤 —— 頂層草稿錨這裡。全劇第一場之前是 `""`。 */
  let topAnchor = "";
  /** 目前這一場裡前一個正式的標籤（主場次自己或它的子場次）—— 草稿子場次錨這裡。 */
  let subAnchor = "";
  const drafts = new Map<string, number>();

  const draftLabel = (anchor: string) => {
    const n = (drafts.get(anchor) ?? 0) + 1;
    drafts.set(anchor, n);
    return anchor ? `S${anchor}[D${n}]` : `[D${n}]`;
  };

  return {
    topLevel(draft: boolean): Pick<SceneNumber, "number" | "label"> {
      if (draft) {
        // 草稿主場次的子場次一律是草稿，沿用它的錨點。
        subAnchor = topAnchor;
        return { number: top, label: draftLabel(topAnchor) };
      }
      top += 1;
      sub = 0;
      topAnchor = subAnchor = String(top);
      return { number: top, label: topAnchor };
    },
    subscene(draft: boolean): Pick<SceneNumber, "number" | "label"> {
      if (draft) return { number: top, label: draftLabel(subAnchor) };
      sub += 1;
      subAnchor = `${top}.${sub}`;
      return { number: top, label: subAnchor };
    },
  };
}

/**
 * 把持久化的 ProseMirror JSON hydrate 成 doc 節點——讀取邊界的入口。
 *
 * 存在的理由：規格 §6.4 的讀取路徑（撈 jsonb → `Node.fromJSON` → 走一遍樹）只有這
 * 一種寫法，集中在這裡，順帶保證「同一份 schema 餵給 `Node.fromJSON`」這條 Yjs
 * 升級路徑的前提隨時可測。
 */
export function docFromJSON(json: unknown): ProseMirrorNode {
  return schema.nodeFromJSON(json);
}
