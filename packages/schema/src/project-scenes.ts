/**
 * `projectScenes(doc)` —— 從 doc 推導場次的顯示序號。
 *
 * **純函式，Node 與瀏覽器都能跑**（§5.4）。場次表、PDF 匯出、唯讀分享各自呼叫它；
 * 編輯器也一樣（只是還得包一層 ProseMirror decoration 讓 node view 知道重繪）。
 *
 * **推導值不進 doc、不進 DB**：場次號在系統裡從來不是 key——約束 1 說下游一律掛
 * `sceneId`，沒有任何查詢用場次號 join。它只在渲染那一刻有意義，就該在渲染時才算。
 *
 * **本票券（02）的範圍**：頂層 `scene` 依文件順序編 `1..N`。子場次號（`5.1`）、
 * 群組成員各佔頂層號、草稿跳號另編 `S11[D1]`——都在 §5.4 定義，隨對應節點型別
 * 在後續票券長出。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { schema } from "./schema";

export interface SceneNumber {
  /** 場次的永久識別碼（`sc_` 前綴）。下游關聯掛這個，不掛序號。 */
  sceneId: string;
  /** 依文件順序推導的顯示序號，`1..N`。呈現用標籤，重排時會變。 */
  number: number;
}

/**
 * 依文件順序把頂層場次推導成 `1..N`。
 *
 * @param doc 已 hydrate 的 ProseMirror doc 節點（用本模組的 `schema`；見 `docFromJSON`）。
 */
export function projectScenes(doc: ProseMirrorNode): SceneNumber[] {
  const numbers: SceneNumber[] = [];
  doc.forEach((node) => {
    if (node.type.name === "scene") {
      numbers.push({ sceneId: node.attrs.sceneId as string, number: numbers.length + 1 });
    }
  });
  return numbers;
}

/**
 * 把持久化的 ProseMirror JSON hydrate 成 doc 節點——讀取邊界的入口。
 *
 * 存在的理由：規格 §6.4 的讀取路徑（撈 jsonb → `Node.fromJSON` → 走一遍樹）只有這
 * 一種寫法，集中在這裡，順帶保證「同一份 schema 餵給 `Node.fromJSON`」這條 Yjs
 * 升級路徑的前提隨時可測。
 */
export function docFromJSON(json: unknown): ProseMirrorNode {
  return schema.nodeFromJSON(json);
}
