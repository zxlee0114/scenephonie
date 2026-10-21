/**
 * 場次表的預覽（票券 15 驗收時加的）：點一列先看這一場寫了什麼，確定了才跳回劇本 —— 整列可點
 * 太容易誤按。這裡把**一場的內文**從 doc 讀成純資料，畫法在 `ScenePreview`。唯讀，沒有寫入路徑。
 */
import type { DialogueCharacterRef, SubsceneKind, VoiceStyle } from "@scenephonie/schema";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type PreviewBlock =
  | { type: "action" | "insertShot"; text: string }
  | { type: "dialogue"; speaker: string | null; voiceStyle: VoiceStyle; text: string };

/**
 * 一段連續的內文。主場次的內文會被子場次切開（子場次之後還能接主場次的區塊），所以一場是
 * **依文件順序**的好幾段；`subscene` 標出那一段是哪個子場次。
 */
export interface PreviewSegment {
  subscene?: { sceneId: string; kind: SubsceneKind };
  blocks: PreviewBlock[];
}

/**
 * 那一場的內文。主場次與子場次讀自己的節點；群組成員沒有自己的內容，讀**屬於它的片段**（依文件
 * 順序接起來，跳過其他成員的片段）。找不到這一場時回傳空陣列。
 */
export function scenePreview(doc: ProseMirrorNode, sceneId: string): PreviewSegment[] {
  const bodies: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    const type = node.type.name;
    if ((type === "scene" || type === "subscene") && node.attrs.sceneId === sceneId) {
      bodies.push(node);
      return false;
    }
    if (type === "groupFragment" && node.attrs.memberId === sceneId) {
      bodies.push(node);
      return false;
    }
    // 只往會裝著場次的容器裡找；區塊裡沒有場次。
    return type === "scene" || type === "sceneGroup" || type === "groupFragment";
  });

  const segments: PreviewSegment[] = [];
  const main = () => {
    const last = segments.at(-1);
    if (last && !last.subscene) return last;
    const fresh: PreviewSegment = { blocks: [] };
    segments.push(fresh);
    return fresh;
  };
  for (const body of bodies) {
    body.forEach((child) => {
      if (child.type.name === "subscene") {
        segments.push({
          subscene: { sceneId: child.attrs.sceneId as string, kind: child.attrs.kind as SubsceneKind },
          blocks: blocksOf(child),
        });
      } else {
        main().blocks.push(block(child));
      }
    });
  }
  return segments;
}

function blocksOf(node: ProseMirrorNode): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  node.forEach((child) => blocks.push(block(child)));
  return blocks;
}

function block(node: ProseMirrorNode): PreviewBlock {
  if (node.type.name === "dialogue") {
    const character = node.attrs.character as DialogueCharacterRef | null;
    return {
      type: "dialogue",
      // 說話者印**這一場的叫法**（displayName）—— 預覽是讀稿，不是讀實體目錄。
      speaker: character?.displayName ?? null,
      voiceStyle: node.attrs.voiceStyle as VoiceStyle,
      text: node.textContent,
    };
  }
  return { type: node.type.name === "insertShot" ? "insertShot" : "action", text: node.textContent };
}
