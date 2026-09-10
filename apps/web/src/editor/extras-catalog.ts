/**
 * 「別場用過哪些群演描述」—— 群演欄自動補全的來源（§4.7、票券 09）。
 *
 * 是 **projection（讀）**：描述散在各場的 `extras` attr 裡，這裡只走一遍收集。
 *
 * ⚠️ **只回字串，不回 id。** 這是與人物／地點**刻意相反**的設計：那兩者的自動補全命中的是
 * 一筆實體（往後所有引用都聚合得起來），群演命中的只是幾個字 —— 補上「咖啡廳客人」不代表
 * 第 3 場與第 7 場是同一批人，而群演正是因為沒有那種身分連續性才不是人物。
 * 想在這裡順手回傳 `extraId` 之前先讀 CONTEXT.md 的「群演」詞條：那會做出一個假承諾。
 */
import type { Node as PMNode } from "@tiptap/pm/model";

import { sceneExtras } from "@scenephonie/schema";

/** 全劇用過的群演描述，依第一次出現的順序、去重（大小寫與空白原樣，那是編劇打的字）。 */
export function extraDescriptions(doc: PMNode): string[] {
  const seen = new Set<string>();
  doc.descendants((node) => {
    if (typeof node.attrs.sceneId !== "string") return;
    for (const extra of sceneExtras(node.attrs.extras)) seen.add(extra.description);
  });
  return [...seen];
}
