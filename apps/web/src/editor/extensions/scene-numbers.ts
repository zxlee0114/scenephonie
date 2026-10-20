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
 *
 * 子場次（票券 11）走同一個 decoration，號碼是 `5.1`；兩邊的 node view 是同一支 `SceneView`。
 * 群組成員（票券 12）也是：各佔一個頂層號。片段另有一份 spec（`FragmentLabelSpec`）—— 片段左側的
 * 常駐標籤要印它的成員是誰，而成員改了地點時**片段節點沒變**，只有 decoration 叫得動它重繪。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

import { projectScenes, sceneLocationLabel, subsceneCount } from "@scenephonie/schema";

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
  /**
   * 子場次專用：主場次的時間欄（票券 11）。時間下拉依種類排序要用它 —— 走 decoration 而不是
   * 讓 node view 自己往上讀，是因為主場次改了時間時**子場次的節點沒變**，node view 不會重繪。
   * 主場次為 `undefined`。
   */
  parentTime?: string | null;
  /** 主場次專用：底下有幾個子場次（刪除選單的標籤）。理由同上 —— 加一個子場次不改主場次的 attr。 */
  subscenes?: number;
  /** 群組成員專用：它是第幾個成員（1 起算）—— `⌘+1`／`⌘+2`／`⌘+3` 的鍵就是這個數字。 */
  memberOrdinal?: number;
}

/**
 * 片段左側的常駐標籤（票券 12）：這一段屬於哪個成員。讓交錯**看得見** —— 編劇一眼知道自己在
 * 哪一邊，不必從人物去推（票券 15）。
 */
export interface FragmentLabelSpec {
  /** 成員是第幾個（1 起算），也就是切到它的那顆鍵。 */
  memberOrdinal: number;
  /** 成員的場次號。 */
  memberNo: string;
  /** 成員的地點（雜景多地點以頓號串起）；還沒填是 `null`。 */
  location: string | null;
}

/** 給片段的 node view 用：從它收到的 decorations 取出標籤 spec。 */
export function fragmentLabelOf(decorations: readonly Decoration[]): FragmentLabelSpec | undefined {
  return decorations.find((d) => d.spec && "memberNo" in d.spec)?.spec as FragmentLabelSpec | undefined;
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

            const labelBySceneId = new Map(
              projectScenes(state.doc).map((s) => [s.sceneId, s.label] as const),
            );

            const decos: Decoration[] = [];
            const last = state.doc.childCount - 1;
            const push = (node: PMNode, pos: number, spec: Omit<SceneNumberSpec, "sceneNo" | "selected">) => {
              const label = labelBySceneId.get(node.attrs.sceneId as string) ?? "?";
              const covered = from <= pos && to >= pos + node.nodeSize;
              decos.push(
                Decoration.node(
                  pos,
                  pos + node.nodeSize,
                  { "data-scene-no": label },
                  { sceneNo: label, selected: covered, ...spec } satisfies SceneNumberSpec,
                ),
              );
            };
            /** 一段內容（主場次或片段）裡的子場次 —— 也有自己的號碼（5.1）。 */
            const pushSubscenes = (container: PMNode, containerPos: number, owner: PMNode) => {
              // 座標：容器之前 + 1 進入內容，再加孩子的 offset。
              container.forEach((child, offset) => {
                if (child.type.name !== "subscene") return;
                push(child, containerPos + 1 + offset, {
                  isFirst: false,
                  isLast: false,
                  parentTime: (owner.attrs.time as string | null) ?? null,
                });
              });
            };
            state.doc.forEach((node, pos, index) => {
              if (node.type.name === "scene") {
                push(node, pos, {
                  isFirst: index === 0,
                  isLast: index === last,
                  subscenes: subsceneCount(node),
                });
                pushSubscenes(node, pos, node);
                return;
              }
              if (node.type.name !== "sceneGroup") return;
              // 群組（票券 12）：成員各佔一個頂層號；片段帶著它成員的標籤。
              const members = new Map<string, { node: PMNode; ordinal: number }>();
              node.forEach((child, offset) => {
                if (child.type.name !== "groupMember") return;
                const ordinal = members.size + 1;
                members.set(child.attrs.sceneId as string, { node: child, ordinal });
                push(child, pos + 1 + offset, { isFirst: false, isLast: false, memberOrdinal: ordinal });
              });
              node.forEach((child, offset) => {
                if (child.type.name !== "groupFragment") return;
                const at = pos + 1 + offset;
                const member = members.get(child.attrs.memberId as string);
                if (!member) return;
                decos.push(
                  Decoration.node(at, at + child.nodeSize, {}, {
                    memberOrdinal: member.ordinal,
                    memberNo: labelBySceneId.get(member.node.attrs.sceneId as string) ?? "?",
                    location: sceneLocationLabel(member.node),
                  } satisfies FragmentLabelSpec),
                );
                pushSubscenes(child, at, member.node);
              });
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
