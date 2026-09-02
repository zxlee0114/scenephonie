/**
 * `createNextScene` —— 建立下一個場次。
 *
 * 對應 `/next`、⌘+Enter、場次腳部按鈕三個入口的共同意圖（§7.1）。
 *
 * **准入判準（§6.3）**：強制執行不變式 ⑦（這是五個鑄造時刻之一 `createScene`），
 * 且以 `afterSceneId` 定址而非位置。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { mintSceneId } from "../ids";
import { schema } from "../schema";
import { type CommandResult, ok, reject } from "./result";
import { docFrom, topLevelArray } from "./tree";

export interface CreateNextSceneOptions {
  /**
   * 在這個 `sceneId` 之後插入新場次；`null`／省略 ＝ 接在全劇最後一場之後。
   * **以 id 定址** —— 用滑鼠點的入口必須自己傳這個，靠 selection 推算會插錯位置（§7.1）。
   */
  readonly afterSceneId?: string | null;
}

/** 一個空場次：單一空 `action` 區塊、metadata 全為 schema 預設（→ 自動草稿）。 */
function emptyScene(): ProseMirrorNode {
  return schema.node("scene", { sceneId: mintSceneId() }, schema.node("action", null, []));
}

export function createNextScene(
  doc: ProseMirrorNode,
  options: CreateNextSceneOptions = {},
): CommandResult {
  const children = topLevelArray(doc);
  const { afterSceneId } = options;

  let insertAt: number;
  if (afterSceneId == null) {
    insertAt = children.length;
  } else {
    const idx = children.findIndex((n) => n.attrs.sceneId === afterSceneId);
    if (idx === -1) return reject(`找不到 sceneId「${afterSceneId}」，無法在其後建立場次`);
    insertAt = idx + 1;
  }

  const next = [...children];
  next.splice(insertAt, 0, emptyScene());

  try {
    return ok(docFrom(next));
  } catch (err) {
    return reject(`建立場次後 doc 不符 schema：${(err as Error).message}`);
  }
}
