/**
 * `projectScenes(doc)` —— 從 doc 推導場次的顯示序號。
 *
 * **純函式，Node 與瀏覽器都能跑**（§5.4）。場次表、PDF 匯出、唯讀分享各自呼叫它；
 * 編輯器也一樣（只是還得包一層 ProseMirror decoration 讓 node view 知道重繪）。
 *
 * **推導值不進 doc、不進 DB**：場次號在系統裡從來不是 key——約束 1 說下游一律掛
 * `sceneId`，沒有任何查詢用場次號 join。它只在渲染那一刻有意義，就該在渲染時才算。
 *
 * **範圍**：頂層 `scene` 依文件順序編 `1..N`；子場次（票券 11）編 `5.1`（父場次號 ＋ 點號 ＋
 * 該父場次底下第幾個子場次），緊接在主場次之後。群組成員各佔頂層號、草稿跳號另編 `S11[D1]`
 * —— 都在 §5.4 定義，隨對應節點型別在後續票券長出。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { schema } from "./schema";

export interface SceneNumber {
  /** 場次的永久識別碼（`sc_` 前綴）。下游關聯掛這個，不掛序號。 */
  sceneId: string;
  /** 依文件順序推導的顯示序號，`1..N`。子場次是它主場次的號碼。呈現用標籤，重排時會變。 */
  number: number;
  /**
   * 印出來的樣子：主場次 `"5"`、子場次 `"5.1"`（點號，不是連字號 —— 連字號是鏡號的慣例）。
   * ⚠️ 任何東西都不准引用它，只能引用 `sceneId`（ADR-0006 保護規則 2）。
   */
  label: string;
  /** 子場次的主場次；主場次為 `undefined`。 */
  parentSceneId?: string;
}

/**
 * 依文件順序把場次推導成 `1..N`，子場次緊接在主場次之後編 `N.1`、`N.2`…
 *
 * @param doc 已 hydrate 的 ProseMirror doc 節點（用本模組的 `schema`；見 `docFromJSON`）。
 */
export function projectScenes(doc: ProseMirrorNode): SceneNumber[] {
  const numbers: SceneNumber[] = [];
  let top = 0;
  doc.forEach((node) => {
    if (node.type.name !== "scene") return;
    top += 1;
    const sceneId = node.attrs.sceneId as string;
    numbers.push({ sceneId, number: top, label: String(top) });
    let sub = 0;
    node.forEach((child) => {
      if (child.type.name !== "subscene") return;
      sub += 1;
      numbers.push({
        sceneId: child.attrs.sceneId as string,
        number: top,
        label: `${top}.${sub}`,
        parentSceneId: sceneId,
      });
    });
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
