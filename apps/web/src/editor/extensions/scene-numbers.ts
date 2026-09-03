/**
 * 場次號 decoration —— §5.4 / §7.9。
 *
 * 場次號**不進文件、不進資料庫**：它只在渲染那一刻有意義。推導用 `@scenephonie/schema` 的
 * `projectScenes(doc)`（純函式，場次表／PDF／唯讀分享各自呼叫的同一支）。編輯器多包一層
 * ProseMirror decoration，才能讓 node view 知道該重繪 —— node view 預設只在「自己的節點變了」
 * 時重繪，插入場次不會動到後面的場次，它們的編號會停在舊值（§7.7）。
 *
 * 值放 decoration 的 `spec`，**不寫 class**：`NodeViewWrapper` 的 className 由 React 控制，
 * 每次重繪會把 ProseMirror 加的 class 洗掉（§7.7）。node view 從 `props.decorations` 讀 spec。
 *
 * decoration 在每次 state 變動都會被呼叫（含只移動游標）——doc 與選取範圍都沒變就回快取。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

import { projectScenes } from "@scenephonie/schema";

export const sceneNumbersKey = new PluginKey("scenephonie/sceneNumbers");

export interface SceneNumberSpec {
  /** 推導出來的顯示序號（字串），未知時為 "?"。 */
  sceneNo: string;
  /** 整場被選取範圍完整涵蓋（⌘+A 第三段）——整塊反白由 node view 畫，不靠瀏覽器原生。 */
  selected: boolean;
  /** 全劇第一場／最後一場。
   * ⚠️ 不能用 CSS `:first-child`／`:last-child` 判斷：`ReactNodeViewRenderer` 會替每個 node view
   * 包一層 host `<div>`，`.scene` 永遠是那層 host 的唯一子元素 —— 兩個偽類對**每一場**都成立
   * （腳部按鈕因此永遠不收起、場次間距也套錯）。位置只有文件知道，所以走 decoration。 */
  isFirst: boolean;
  isLast: boolean;
}

/** 給 node view 用：從它收到的 decorations 取出本場的 spec。 */
export function sceneNumberOf(decorations: readonly Decoration[]): SceneNumberSpec | undefined {
  return decorations.find((d) => d.spec && "sceneNo" in d.spec)?.spec as SceneNumberSpec | undefined;
}

export const SceneNumbers = Extension.create({
  name: "sceneNumbers",
  addProseMirrorPlugins() {
    let cache: { doc: PMNode; from: number; to: number; set: DecorationSet } | null = null;

    return [
      new Plugin({
        key: sceneNumbersKey,
        props: {
          decorations: (state) => {
            const { from, to } = state.selection;
            if (cache && cache.doc === state.doc && cache.from === from && cache.to === to) {
              return cache.set;
            }

            const numberBySceneId = new Map(
              projectScenes(state.doc).map((s) => [s.sceneId, s.number] as const),
            );

            const decos: Decoration[] = [];
            const last = state.doc.childCount - 1;
            state.doc.forEach((node, pos, index) => {
              if (node.type.name !== "scene") return;
              const n = numberBySceneId.get(node.attrs.sceneId as string);
              const label = n == null ? "?" : String(n);
              const covered = from <= pos && to >= pos + node.nodeSize;
              decos.push(
                Decoration.node(
                  pos,
                  pos + node.nodeSize,
                  { "data-scene-no": label },
                  {
                    sceneNo: label,
                    selected: covered,
                    isFirst: index === 0,
                    isLast: index === last,
                  } satisfies SceneNumberSpec,
                ),
              );
            });

            const set = DecorationSet.create(state.doc, decos);
            cache = { doc: state.doc, from, to, set };
            return set;
          },
        },
      }),
    ];
  },
});
