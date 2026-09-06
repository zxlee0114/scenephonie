/**
 * 「這筆實體被幾場引用」—— 自動補全第一列括號裡那個數字（`📍 海豚公寓房間（12 場）`）。
 *
 * 是 **projection（讀）** 不是狀態：引用散在 doc 裡，這裡只是數一遍。所以它也順便是
 * 「存在＝被引用」在畫面上的具體形狀 —— 數到 0 的實體是孤兒，孤兒不該出現在自動補全。
 *
 * 計數單位是**場次**不是引用次數：同一場的地點欄與對白人物欄指到同一筆，那仍然是一場。
 * 讀取路徑一律容忍懸空與壞形狀（§6.6），所以這裡只數得出來的，不驗證什麼。
 */
import type { Node as PMNode } from "@tiptap/pm/model";

import { sceneAppearingCharacters, sceneLocations } from "@scenephonie/schema";

/** 每筆實體 id → 引用到它的場次數。 */
export function entityUsage(doc: PMNode): Map<string, number> {
  const scenes = new Map<string, Set<string>>(); // entityId → sceneId 集合

  const note = (entityId: unknown, sceneId: string) => {
    if (typeof entityId !== "string" || entityId === "") return;
    const seen = scenes.get(entityId) ?? new Set<string>();
    seen.add(sceneId);
    scenes.set(entityId, seen);
  };

  doc.descendants((node) => {
    const sceneId = node.attrs.sceneId as string | undefined;
    if (typeof sceneId !== "string") return;

    for (const ref of sceneLocations(node.attrs.location)) note(ref.locationId, sceneId);
    for (const ref of sceneAppearingCharacters(node.attrs.appearingCharacters)) {
      note(ref.characterId, sceneId);
    }
    node.descendants((child) => {
      if (child.type.name !== "dialogue") return;
      const speaker = child.attrs.character as { id?: unknown } | null;
      if (speaker) note(speaker.id, sceneId);
    });
  });

  return new Map([...scenes].map(([id, seen]) => [id, seen.size]));
}
