/**
 * 測試專用的 doc/scene builder。**不從 `index.ts` 對外曝露**——只給本套件的
 * `*.test.ts` 用，讓每個測試檔不必各自重寫一份鑄了 `sceneId` 的場次骨架。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { mintSceneId } from "./ids";
import { schema } from "./schema";

/** 造一個帶新鑄 `sceneId`、單一 `action` 區塊的場次。`attrs` 覆蓋 metadata、`text` 覆蓋內文。 */
export function makeScene(attrs: Record<string, unknown> = {}, text = "走進房間"): ProseMirrorNode {
  return schema.node(
    "scene",
    { sceneId: mintSceneId(), ...attrs },
    schema.node("action", null, text ? [schema.text(text)] : []),
  );
}

/** 把場次包成 doc。 */
export function makeDoc(...scenes: ProseMirrorNode[]): ProseMirrorNode {
  return schema.node("doc", null, scenes);
}

/** 三種 `sceneBlock` 的簡寫建構子（`text` 為空時建無內容的區塊）。 */
export const block = {
  action: (text = ""): ProseMirrorNode =>
    schema.node("action", null, text ? [schema.text(text)] : []),
  dialogue: (text = "", attrs: Record<string, unknown> = {}): ProseMirrorNode =>
    schema.node("dialogue", attrs, text ? [schema.text(text)] : []),
  insertShot: (text = ""): ProseMirrorNode =>
    schema.node("insertShot", null, text ? [schema.text(text)] : []),
};

/** 造一個帶新鑄 `sceneId` 的場次，內容是給定的區塊（至少一個）。 */
export function sceneWith(
  blocks: ProseMirrorNode[],
  attrs: Record<string, unknown> = {},
): ProseMirrorNode {
  return schema.node("scene", { sceneId: mintSceneId(), ...attrs }, blocks);
}
