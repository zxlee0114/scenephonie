/**
 * `moveScene` —— 把一個頂層場次搬到序列中的另一個位置。
 *
 * 這是拖曳 ⠿ 與「點場次號 → 搬移到…」的**意圖**；拖曳時哪些落點不畫指示線是**手勢**。
 *
 * **`moveScene` 自己也要拒絕非法目標**（§6.3、[ADR-0007](../../../../docs/adr/0007-document-as-single-authority.md)
 * 最後一列）—— 縱深不是重複：UI 的落點線是滑鼠層的預防，command 的拒絕是模型層的保證，
 * 擋得住伺服器端呼叫與日後的 API。
 *
 * **准入判準（§6.3）**：以 `sceneId` 定址；搬移全程保住 `sceneId`（不變式 ⑦ —— 搬移
 * 不是鑄造時刻，變的只有推導出來的場次號）。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { type CommandResult, ok, reject } from "./result";
import { docFrom, topLevelArray } from "./tree";

export type MoveTarget =
  | { readonly position: "before"; readonly refSceneId: string }
  | { readonly position: "after"; readonly refSceneId: string }
  | { readonly position: "start" }
  | { readonly position: "end" };

export interface MoveSceneOptions {
  readonly sceneId: string;
  readonly target: MoveTarget;
}

export function moveScene(doc: ProseMirrorNode, options: MoveSceneOptions): CommandResult {
  const { sceneId, target } = options;
  const children = topLevelArray(doc);

  const fromIdx = children.findIndex((n) => n.attrs.sceneId === sceneId);
  if (fromIdx === -1) return reject(`找不到要搬移的 sceneId「${sceneId}」`);

  let toIdx: number;
  if (target.position === "start") {
    toIdx = 0;
  } else if (target.position === "end") {
    toIdx = children.length;
  } else {
    const { position, refSceneId } = target;
    if (refSceneId === sceneId) {
      return reject("非法目標：不能把場次搬到相對於它自己的位置");
    }
    const refIdx = children.findIndex((n) => n.attrs.sceneId === refSceneId);
    if (refIdx === -1) return reject(`非法目標：找不到參考 sceneId「${refSceneId}」`);
    toIdx = position === "before" ? refIdx : refIdx + 1;
  }

  const next = [...children];
  const [moved] = next.splice(fromIdx, 1);
  // splice 掉來源後，落在來源之後的索引全部左移一格
  if (toIdx > fromIdx) toIdx -= 1;
  next.splice(toIdx, 0, moved!);

  return ok(docFrom(next));
}
