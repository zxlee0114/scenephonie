/**
 * 場次表那一側的接線（票券 15）：從**記憶體裡的 doc** 推導場次表，實體名從專案目錄接上。
 *
 * 為什麼住在編輯器的樹裡：場次表是同一份劇本的另一種讀法（§7.10），編輯器切到場次表時**不卸載**
 * —— 剛打的字不必等自動存檔落地就看得到，而且實體名目錄（含這一輪剛建的實體）只有
 * `EntityCatalogProvider` 底下拿得到。推導本身是 kernel 的純函式，這裡只接線。
 */
"use client";

import type { Editor } from "@tiptap/core";
import { labelSceneTable, projectScenes, projectSceneTable } from "@scenephonie/schema";
import { useMemo, useState } from "react";

import { SceneTable } from "@/scene-table/SceneTable";
import { ScenePreview } from "@/scene-table/ScenePreview";
import { scenePreview } from "@/scene-table/scene-preview";

import { useEntityCatalog } from "./entity-catalog";
import { cursorSceneId } from "./scene-anchor";

export function SceneTableView({
  editor,
  anchorToCursor,
  onOpenScene,
}: {
  editor: Editor;
  /** 拿游標所在的場次對位嗎 —— 劇本還沒顯示過時，游標不是編劇放的，不對位。 */
  anchorToCursor: boolean;
  onOpenScene: (sceneId: string) => void;
}) {
  const catalog = useEntityCatalog();
  const doc = editor.state.doc;

  const rows = useMemo(() => {
    const names = {
      characters: new Map(catalog.characters.map((c) => [c.id, c.name])),
      locations: new Map(catalog.locations.map((l) => [l.id, l.name])),
    };
    // `missingRefs` 是診斷輸出（§6.6）—— 不渲染、不對編劇曝露，這裡刻意丟掉。
    return labelSceneTable(projectSceneTable(doc), names).rows;
  }, [doc, catalog.characters, catalog.locations]);

  const anchor = useMemo(
    () => (anchorToCursor ? tableAnchor(doc, cursorSceneId(editor.state), rows) : null),
    [anchorToCursor, doc, editor, rows],
  );

  // 點一列先開預覽，不直接跳 —— 整列可點太容易誤按（票券 15 驗收）。
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewRow = rows.find((r) => r.sceneId === previewing);

  return (
    <>
      <SceneTable rows={rows} anchorSceneId={anchor} onSelect={setPreviewing} />
      {previewRow && (
        <ScenePreview
          row={previewRow}
          segments={scenePreview(doc, previewRow.sceneId)}
          labelOf={(id) => rows.find((r) => r.sceneId === id)?.label}
          onClose={() => setPreviewing(null)}
          onOpenScene={onOpenScene}
        />
      )}
    </>
  );
}

/**
 * 游標所在那一場在表上對位到哪一列。草稿不進表 —— 游標在草稿裡時，對位到它**前面最近的**
 * 一列（同一次走訪的文件順序）；前面一列都沒有就不對位。
 */
function tableAnchor(
  doc: Editor["state"]["doc"],
  sceneId: string | null,
  rows: readonly { sceneId: string }[],
): string | null {
  if (!sceneId) return null;
  const inTable = new Set(rows.map((r) => r.sceneId));
  const order = projectScenes(doc).map((s) => s.sceneId);
  for (let i = order.indexOf(sceneId); i >= 0; i--) {
    if (inTable.has(order[i]!)) return order[i]!;
  }
  return null;
}
