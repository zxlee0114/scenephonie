/**
 * 劇本 ↔ 場次表的對位（票券 15，§7.10）：切換時以**游標所在場次**為 scroll anchor，列點擊跳回
 * 編輯器並定位到該場。兩個方向都以永久 `sceneId` 定址 —— 重排場次也不跳錯（約束 1）。
 */
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";

import { findSceneNode, sceneContext } from "./address";
import { flash } from "./flash";
import { scrollToWritingPosition } from "./typewriter-scroll";

/** 游標直接所在的那一場（子場次就是子場次，片段算它的成員）；不在任何一場裡回 `null`。 */
export function cursorSceneId(state: EditorState): string | null {
  return sceneContext(state.selection.$from)?.sceneId ?? null;
}

/**
 * 那一場的內容從哪裡開始（節點之前的座標）。成員沒有自己的內容 —— 它的第一個片段。
 * 找不到回 `null`。
 */
function contentStart(doc: PMNode, sceneId: string): number | null {
  const hit = findSceneNode(doc, sceneId);
  if (!hit) return null;
  if (hit.node.type.name !== "groupMember") return hit.pos;

  const groupPos = doc.resolve(hit.pos).before();
  let at: number | null = null;
  doc.nodeAt(groupPos)?.forEach((child, offset) => {
    if (at == null && child.type.name === "groupFragment" && child.attrs.memberId === sceneId) {
      at = groupPos + 1 + offset;
    }
  });
  return at;
}

/**
 * 把游標送進 `sceneId` 那一場內文的開頭，直接落在打字餘裕線上，並讓那一場短暫浮現底色。
 * 找不到那一場就什麼都不做。
 */
export function revealScene(editor: Editor, sceneId: string): void {
  const { state, view } = editor;
  const start = contentStart(state.doc, sceneId);
  if (start == null) return;
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(start + 1))));
  view.focus();
  scrollToSceneOf(editor, sceneId);
  const el = sceneElement(editor, sceneId);
  if (el) flash(el);
}

/**
 * 只動捲軸不動游標：讓 `sceneId` 那一場直接落在打字餘裕線上（從場次表切回劇本時用）。
 * 不捲過去 —— 劇本剛從隱藏變回來，一路捲過整份稿子只是噪音。
 */
export function scrollToSceneOf(editor: Editor, sceneId: string): void {
  scrollToWritingPosition(sceneElement(editor, sceneId), { instant: true });
}

function sceneElement(editor: Editor, sceneId: string): Element | null {
  // id 是 nanoid 字元集（`A-Za-z0-9_-`），放進引號裡的屬性選擇器不必跳脫。
  return editor.view.dom.querySelector(`[data-scene-id="${sceneId}"]`);
}

