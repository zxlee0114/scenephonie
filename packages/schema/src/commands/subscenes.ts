/**
 * 子場次的建立與刪除（票券 11、§4.4、[ADR-0003](../../../../docs/adr/0003-inserted-scenes-as-subscenes.md)／
 * [ADR-0006](../../../../docs/adr/0006-continuous-action-as-continuation-subscenes.md)）。
 *
 * `/insert`（種類＝插入）與 `/continue-to`（種類＝接續）是同一個意圖 `createSubscene`，差別只在
 * `kind` —— 那是編劇按下哪個入口的宣告，所以由呼叫端傳進來、**必填**，這裡不代填。
 * `/back-to` 不建立任何東西，是純手勢，住在編輯器。
 *
 * **准入判準（§6.3）**：`createSubscene` 強制執行不變式 ①（空場次不可建立）與 ⑦（五個鑄造時刻
 * 之一 `createSubscene`），以 `sceneId` 定址；`deleteScene` 以 `sceneId` 定址。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { mintSceneId } from "../ids";
import { hasOwnContent } from "../subscenes";
import { schema, SUBSCENE_KINDS, type SubsceneKind } from "../schema";
import { removeGroupMember } from "./groups";
import { type CommandResult, ok, reject } from "./result";
import {
  childrenOf,
  findContainer,
  findScene,
  replaceAt,
  replaceScene,
  type ContainerAddress,
  type TreePath,
} from "./tree";

/** 明確套用時複製的三欄（§4.4）。**登場人物不在其中** —— 那不是時空，換了地方人也可能換了。 */
const APPLIED_ATTRS = ["intExt", "time", "location"] as const;

export interface SubsceneAnchor extends ContainerAddress {
  /**
   * 游標所在的那一場 —— 主場次、群組成員（再加 `fragmentIndex`）**或**子場次。兩處按下去語意
   * 不變：永遠是「在本主場次底下建立一個子場次」；深度兩層讓「在子場次裡按」只有一種合法解讀
   * （建立兄弟，接在那個子場次之後）。
   */
  readonly sceneId: string;
  /**
   * 在主場次（或片段）裡：新子場次接在第幾個孩子之後（`-1` ＝ 當第一個孩子，永遠被不變式 ① 擋下）。
   * 傳遞參數，不被儲存（§5.2 `fragmentIndex` 先例）。在子場次裡按時不看這個值。
   */
  readonly afterBlockIndex: number;
}

export interface CreateSubsceneOptions extends SubsceneAnchor {
  readonly kind: SubsceneKind;
  /**
   * 明確套用（`/insert`／`/continue-to` 的第二步）：複製這一場的內外／時間／地點。
   * 省略或 `null` ＝「不沿用，留空」。套用是**複製，不是連動**。
   */
  readonly applyFromSceneId?: string | null;
}

interface Placement {
  /** 裝新子場次的那一段內容（主場次或片段）。 */
  readonly container: ProseMirrorNode;
  readonly path: TreePath;
  /** 新子場次在那一段孩子序列裡的位置。 */
  readonly insertAt: number;
}

function placement(doc: ProseMirrorNode, anchor: SubsceneAnchor): Placement | string {
  const hit = findScene(doc, anchor.sceneId);
  if (!hit) return `找不到 sceneId「${anchor.sceneId}」`;

  if (hit.containerPath) {
    // 在子場次裡：兄弟，接在它之後。裝它的那一段（主場次或片段）從 hit 取。
    let container = doc;
    for (const i of hit.containerPath) container = container.child(i);
    return { container, path: hit.containerPath, insertAt: hit.path[hit.path.length - 1]! + 1 };
  }

  const at = findContainer(doc, anchor);
  if (typeof at === "string") return at;
  if (!at.hostsSubscenes) return `「${anchor.sceneId}」裡不能再建立子場次`;

  const { afterBlockIndex } = anchor;
  if (afterBlockIndex < -1 || afterBlockIndex >= at.node.childCount) {
    return `場次「${anchor.sceneId}」沒有第 ${afterBlockIndex} 個孩子（共 ${at.node.childCount} 個）`;
  }
  const insertAt = afterBlockIndex + 1;

  // 不變式 ①：插入點之前必須已經有主場次自己的內容 —— 否則主場次就不是起點場次，結構在說謊。
  // 片段比照辦理：一段以子場次開頭的片段，讀起來就是那個成員的內容沒有起點。
  let opened = false;
  for (let i = 0; i < insertAt; i++) if (hasOwnContent(at.node.child(i))) opened = true;
  if (!opened) {
    return "主場次的內容必須以主場次自己的內容開始 —— 空場次裡不能建立子場次（不變式 ①）";
  }
  return { container: at.node, path: at.path, insertAt };
}

/** `/insert`／`/continue-to` 在這個位置可不可用（選單據此決定列不列出來）。 */
export function canCreateSubscene(doc: ProseMirrorNode, anchor: SubsceneAnchor): boolean {
  return typeof placement(doc, anchor) !== "string";
}

export function createSubscene(
  doc: ProseMirrorNode,
  options: CreateSubsceneOptions,
): CommandResult {
  const { kind, applyFromSceneId } = options;
  if (!SUBSCENE_KINDS.includes(kind)) {
    return reject(`子場次的種類只能是 ${SUBSCENE_KINDS.join("／")}，收到「${String(kind)}」`);
  }

  const where = placement(doc, options);
  if (typeof where === "string") return reject(where);

  // metadata 完全不繼承主場次（§4.4）—— 全部走 schema 預設（null），草稿防呆照常。
  const applied: Record<string, unknown> = {};
  if (applyFromSceneId != null) {
    const source = findScene(doc, applyFromSceneId);
    if (!source) return reject(`找不到要套用的場次「${applyFromSceneId}」`);
    for (const name of APPLIED_ATTRS) {
      // 複製不是連動：物件引用也另起一份，之後改來源場次不會牽動這一場。
      const value = source.node.attrs[name] as unknown;
      applied[name] = value == null ? null : JSON.parse(JSON.stringify(value));
    }
  }

  const subscene = schema.node(
    "subscene",
    { ...applied, sceneId: mintSceneId(), kind },
    schema.node("action", null, []),
  );

  const { container, path, insertAt } = where;
  const kids = childrenOf(container);
  kids.splice(insertAt, 0, subscene);

  try {
    const next = container.type.create(container.attrs, kids, container.marks);
    return ok(replaceAt(doc, path, next));
  } catch (err) {
    return reject(`建立子場次後 doc 不符 schema：${(err as Error).message}`);
  }
}

export interface DeleteSceneOptions {
  readonly sceneId: string;
}

/**
 * 刪除一場。**刪主場次一併刪子場次**（§4.4）—— 子樹是一個節點，⌘Z 一步整棵回來，
 * `sceneId` 一起回來。不彈對話框：選單標籤自己寫明數量（`subsceneCount`）。
 *
 * 刪子場次只拿掉它自己；主場次其餘內容原封不動（它的第一個孩子不會是子場次，不變式 ① 不受影響）。
 * 刪掉最後一場也合法 —— 空劇本是一個有自己畫面的狀態（票券 32）。
 */
export function deleteScene(doc: ProseMirrorNode, options: DeleteSceneOptions): CommandResult {
  const hit = findScene(doc, options.sceneId);
  if (!hit) return reject(`找不到 sceneId「${options.sceneId}」`);
  try {
    // 群組成員：它的片段一起走，剩一個成員時群組解散（票券 12）。
    if (hit.node.type.name === "groupMember") {
      return ok(removeGroupMember(doc, hit.path[0]!, options.sceneId));
    }
    return ok(replaceScene(doc, hit, null));
  } catch (err) {
    return reject(`刪除場次後 doc 不符 schema：${(err as Error).message}`);
  }
}

/** 主場次底下有幾個子場次（`SceneMenu` 的刪除標籤：「刪除本場（含 2 個子場次）」）。 */
export function subsceneCount(scene: ProseMirrorNode): number {
  let n = 0;
  scene.forEach((child) => {
    if (child.type.name === "subscene") n++;
  });
  return n;
}
