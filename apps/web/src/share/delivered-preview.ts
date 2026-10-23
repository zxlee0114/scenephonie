/**
 * 分享頁場次表的預覽（票券 20 驗收）：點一列先看這一場寫了什麼，確定了才跳到劇本 —— 跟編輯器的
 * 場次表同一個手勢、同一個 `ScenePreview`。
 *
 * 編輯器的預覽從 doc 讀（`scenePreview`）；分享頁手上只有交付投影，所以這裡從 payload 的閱讀順序裡
 * 把一場的內文撿回來。**不重算任何語意推導值**（不變式 E）：誰是誰的子場次、場次號，都讀 payload 的。
 * 子場次的種類不在交付裡，預覽的子場次標題只印場次號。
 */
import type { DeliveryPayload, ScriptElement } from "@scenephonie/schema";

import type { PreviewBlock, PreviewSegment } from "@/scene-table/scene-preview";

/**
 * 那一場的內文：主場次自己的區塊依文件順序，被子場次切開的那幾段標出是哪個子場次；群組成員接起
 * 屬於它的片段。不在交付裡的場次是空陣列。
 */
export function deliveredScenePreview(payload: DeliveryPayload, sceneId: string): PreviewSegment[] {
  const parentOf = new Map(payload.scenes.map((s) => [s.sceneId, s.parentSceneId]));
  const segments: PreviewSegment[] = [];
  // 現在讀到的區塊屬於哪一場：標題、片段標記、折返標記都會換人；「以下對剪」之後到第一個片段之前不屬於誰。
  let owner: string | null = null;

  for (const element of payload.script) {
    if (element.type === "heading" || element.type === "fragment" || element.type === "returnTo") {
      owner = element.sceneId;
      continue;
    }
    if (element.type === "intercut") {
      owner = null;
      continue;
    }
    if (owner === null) continue;

    const block = previewBlock(element);
    const last = segments.at(-1);
    if (owner === sceneId) {
      if (last && !last.subscene) last.blocks.push(block);
      else segments.push({ blocks: [block] });
    } else if (parentOf.get(owner) === sceneId) {
      if (last?.subscene?.sceneId === owner) last.blocks.push(block);
      else segments.push({ subscene: { sceneId: owner }, blocks: [block] });
    }
  }
  return segments;
}

function previewBlock(element: Extract<ScriptElement, { type: "action" | "insertShot" | "dialogue" }>): PreviewBlock {
  return element.type === "dialogue"
    ? { type: "dialogue", speaker: element.speaker, voiceStyle: element.voiceStyle, text: element.text }
    : { type: element.type, text: element.text };
}
