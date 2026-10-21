/**
 * 場次導覽 sidebar 那一側的接線（票券 16）：從**記憶體裡的 doc** 推導列，場次號讀編輯器那一份
 * （`editorSceneNumbers`）—— gutter 與 sidebar 印同一個號碼，草稿的「離開時才判定」也一致。
 *
 * 住在編輯器的樹裡，理由同場次表（`scene-table-view.tsx`）：實體名目錄只有 `EntityCatalogProvider`
 * 底下拿得到，而游標在哪一場只有編輯器知道。
 */
"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useReducer } from "react";

import { SceneNav } from "@/scene-nav/SceneNav";
import { sceneNavRows } from "@/scene-nav/rows";

import { useEntityCatalog } from "./entity-catalog";
import { editorSceneNumbers, sceneNumbersKey } from "./extensions/scene-numbers";
import { cursorSceneId, revealScene } from "./scene-anchor";

export function SceneNavView({ editor }: { editor: Editor }) {
  const catalog = useEntityCatalog();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const { state } = editor;
  const doc = state.doc;
  const hold = sceneNumbersKey.getState(state)?.hold ?? null;
  const rows = useMemo(
    () =>
      sceneNavRows(editorSceneNumbers(state), doc, {
        characters: new Map(catalog.characters.map((c) => [c.id, c.name])),
        locations: new Map(catalog.locations.map((l) => [l.id, l.name])),
      }),
    // `state` 每筆 transaction 都換一個（連移動游標也是）；列只跟 doc 與草稿鎖有關。
    [doc, hold, catalog.characters, catalog.locations],
  );

  return (
    <SceneNav
      rows={rows}
      currentSceneId={cursorSceneId(state)}
      // 跳過去就是把游標放進那一場（與場次表的「到劇本」同一個落點）—— 高亮因此跟著過去。
      onSelect={(sceneId) => revealScene(editor, sceneId)}
    />
  );
}
