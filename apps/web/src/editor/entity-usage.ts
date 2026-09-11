/**
 * 「這筆實體被幾場引用」—— 自動補全第一列括號裡那個數字（`📍 海豚公寓房間（12 場）`）。
 *
 * 是 **projection（讀）** 不是狀態：引用散在 doc 裡，這裡只是數一遍。所以它也順便是
 * 「存在＝被引用」在畫面上的具體形狀 —— 數到 0 的實體是孤兒，孤兒不該出現在自動補全。
 *
 * 計數單位是**場次**不是引用次數：同一場的地點欄與對白人物欄指到同一筆，那仍然是一場。
 * 讀取路徑一律容忍懸空與壞形狀（§6.6），所以這裡只數得出來的，不驗證什麼。
 *
 * 同一趟走訪也回答改名那一列的另一個問題：**還有幾場印著這個名字**（`scenesShowingName`，
 * 票券 39）。兩個數字問的是同一份引用，只是一個不看顯示名、一個只看顯示名。
 */
import type { Node as PMNode } from "@tiptap/pm/model";

import { dialogueCharacters, sceneAppearingCharacters, sceneLocations } from "@scenephonie/schema";

/**
 * 走一遍 doc，把每一筆**指得到實體的**引用交出來：`(實體 id, 這一場顯示的名字, 哪一場)`。
 *
 * 「指得到」那道門在這裡，不在兩個呼叫端：id 為 null 的過渡引用（票券 04／07 的佔位形狀）
 * 不算引用 —— 它指不到任何實體。守門收在這一層，兩個數字才不會對「什麼算一筆引用」分家。
 */
function eachRef(doc: PMNode, visit: (entityId: string, displayName: string, sceneId: string) => void) {
  const note = (entityId: unknown, displayName: string, sceneId: string) => {
    if (typeof entityId !== "string" || entityId === "") return;
    visit(entityId, displayName, sceneId);
  };
  doc.descendants((node) => {
    const sceneId = node.attrs.sceneId as string | undefined;
    if (typeof sceneId !== "string") return;

    for (const ref of sceneLocations(node.attrs.location)) {
      note(ref.locationId, ref.displayName, sceneId);
    }
    for (const ref of sceneAppearingCharacters(node.attrs.appearingCharacters)) {
      note(ref.characterId, ref.displayName, sceneId);
    }
    node.descendants((child) => {
      if (child.type.name !== "dialogue") return;
      // 齊聲的每一個人都算一次引用 —— 走正規化，因為 attr 是「單值 ｜ 陣列 ｜ null」。
      for (const speaker of dialogueCharacters(child.attrs.character)) {
        note(speaker.id, speaker.displayName, sceneId);
      }
    });
  });
}

/** 每筆實體 id → 引用到它的場次數。 */
export function entityUsage(doc: PMNode): Map<string, number> {
  const scenes = new Map<string, Set<string>>(); // entityId → sceneId 集合

  eachRef(doc, (entityId, _displayName, sceneId) => {
    const seen = scenes.get(entityId) ?? new Set<string>();
    seen.add(sceneId);
    scenes.set(entityId, seen);
  });

  return new Map([...scenes].map(([id, seen]) => [id, seen.size]));
}

/**
 * 這筆實體**還印著 `displayName` 的場次有幾場** —— 改名第二步那兩列的數字（票券 39）。
 *
 * 判準是 `id ＋ 顯示名`，不是 id：真正取過別名的那一場（顯示名不等於實體名）不在這個數字裡，
 * 因為它本來就不打算跟著改（`retitleEntityRefs` 的同一條分界，ADR-0005）。
 *
 * 單位與 `entityUsage` 一致是**場次**：同一場的登場人物欄與對白都印著舊名，那仍然是一場。
 */
export function scenesShowingName(doc: PMNode, entityId: string, displayName: string): number {
  const scenes = new Set<string>();
  eachRef(doc, (id, shown, sceneId) => {
    if (id === entityId && shown === displayName) scenes.add(sceneId);
  });
  return scenes.size;
}
