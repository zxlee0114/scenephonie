/**
 * command bridge —— 把 `@scenephonie/schema` 的純函式 command 接到編輯器（§6.3 寫入邊界）。
 *
 * kernel command 是 `(doc) => CommandResult`（吃 doc 吐 doc，用 kernel 自己的 schema）。這裡：
 *   1. 取 `editor.state.doc`（Tiptap schema 的 PMNode）→ 丟給 command；
 *   2. `ok` → 把結果經 JSON 轉回 Tiptap schema，整份 replace 進一個 transaction（結構操作
 *      不頻繁，whole-doc replace 比逐 step 重算單純，且 schema-equivalence.test 已保證往返等價）；
 *   3. `!ok` → no-op，`console.warn`（模型拒絕了意圖，不是程式炸了）。
 *
 * **UI／application 不得直接碰 transaction／mutation／history**（edge-boundary 規則）——
 * 一切具 domain 意義的寫入都走這裡。純文字編輯不經 command，由 ProseMirror 原生處理。
 */
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

import { docFromJSON, type CommandResult } from "@scenephonie/schema";

import type { BlockAddress } from "./address";
import { requestFocus, type PendingFocus } from "./focus";
import { markSceneBorn } from "./scene-birth";

export interface RunOptions {
  /** replace 後把游標放回這個場次 ／ 區塊的內文（doc 座標由本模組在新 doc 上算）。 */
  readonly caretAt?: BlockAddress;
  /** 游標放在該區塊內文的開頭還是**末端**（換型別時是續寫，末端才對）。預設開頭。 */
  readonly caretPlace?: BlockCaretPlace;
  /** replace 後排入一個欄位 focus 請求（node view 掛載時 claim）。 */
  readonly focusField?: PendingFocus;
  /** true ＝ 把 focus 請求指向「新出現的那個場次」的 chip row（用 id 差集找出新場次）。 */
  readonly focusNewSceneMeta?: boolean;
}

/** doc 頂層場次的 sceneId（依文件順序）。 */
export function topLevelSceneIds(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === "scene") ids.push(node.attrs.sceneId as string);
  });
  return ids;
}

export type BlockCaretPlace = "start" | "end";

/** 場次內第 `blockIndex` 個區塊的內文起點／末端（doc 座標）；找不到回 `null`。 */
export function blockContentPos(
  doc: PMNode,
  sceneId: string,
  blockIndex: number,
  place: BlockCaretPlace = "start",
): number | null {
  let found: number | null = null;
  doc.forEach((scene, scenePos) => {
    if (found != null || scene.type.name !== "scene" || scene.attrs.sceneId !== sceneId) return;
    if (blockIndex < 0 || blockIndex >= scene.childCount) return;
    let pos = scenePos + 1; // 進入場次內容
    for (let i = 0; i < blockIndex; i++) pos += scene.child(i).nodeSize;
    found = pos + 1 + (place === "end" ? scene.child(blockIndex).content.size : 0);
  });
  return found;
}

export function runKernelCommand(
  editor: Editor,
  produce: (doc: PMNode) => CommandResult,
  options: RunOptions = {},
): boolean {
  const { state, view } = editor;
  // command 是 isomorphic 的，用 kernel 自己的 schema —— 先把當前 doc 過 JSON 轉成 kernel 節點，
  // 才不會讓 command 內部重用到 Tiptap schema 的子節點（跨 schema 的 content 檢查會炸）。
  const result = produce(docFromJSON(state.doc.toJSON()) as unknown as PMNode);
  if (!result.ok) {
    console.warn("[scenephonie] command 被拒絕：", result.reason);
    return false;
  }

  const before = new Set(topLevelSceneIds(state.doc));
  const nextDoc = editor.schema.nodeFromJSON(result.value.toJSON());
  const tr = state.tr.replaceWith(0, state.doc.content.size, nextDoc.content);

  if (options.caretAt) {
    const pos = blockContentPos(
      tr.doc,
      options.caretAt.sceneId,
      options.caretAt.blockIndex,
      options.caretPlace,
    );
    if (pos != null) tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
  }

  // 新場次的落點由 node view 自己決定（打字餘裕，票券 27）—— 這裡不要先用原生 `scrollIntoView`
  // 把它推到視窗底緣，否則畫面會跳兩下。其他 command 照舊「捲進可視範圍」就好。
  view.dispatch(options.focusNewSceneMeta ? tr : tr.scrollIntoView());

  if (options.focusNewSceneMeta) {
    const added = topLevelSceneIds(view.state.doc).find((id) => !before.has(id));
    if (added) {
      markSceneBorn(added); // 新場次的短暫浮現回饋（SceneView 掛載時領取）
      requestFocus({ kind: "sceneMeta", sceneId: added });
    }
  } else if (options.focusField) {
    requestFocus(options.focusField);
  }

  view.focus();
  return true;
}
