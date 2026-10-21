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
 *
 * 草稿（票券 14）也走這裡：`projectScenes` 那一次走訪順帶推導出 `draft`，標籤就是 `S11[D1]`。
 * 一場是不是草稿可能因為**別的節點**變了而變（主場次標成草稿 → 子場次跟著是；成員之間撞時空），
 * 理由同上，只有 decoration 叫得動它重繪。
 *
 * **離開時才判定**（使用者裁決 2026-10-21）：正在寫的那一場，畫面上是不是草稿在游標**進入時
 * 鎖住**、移到別場時才重新判定；新建的場次（kernel command 鑄出新 id）與**還沒開工**的場次
 * （`isUnstartedScene` —— 新劇本的第一場、重新整理後的空末場）起步是正式。鎖是這個 plugin 的
 * state（`DraftHold`），推導走 `projectScenesWhileEditing` —— doc 不寫任何東西，交付投影讀的
 * 照樣是真實狀態。「進入」有兩條路：內文的游標移進別場（焦點在內文時），或焦點進某一場的
 * chip row。**編輯器整個失焦不算離開** —— 標籤不趁編劇不在時變形。
 *
 * ⚠️ **程式自己搬動的游標不算「移到別場」**：kernel command 整份 replace 會把舊 selection map
 * 到 doc 的一端，bridge 接著 `view.focus()`。那一下不是編劇把游標帶走 —— 在 A 寫字時從選單
 * 標記 B 為草稿，A 的鎖不該動。所以 kernel replace（含它 append 的修復 transaction）之後的
 * selection 與 focusin 都不看，等下一筆編劇自己的 transaction。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

import {
  autoDraftOf,
  projectScenesWhileEditing,
  sceneLocationLabel,
  subsceneCount,
  type DraftHold,
  type SceneNumber,
} from "@scenephonie/schema";

import { allSceneIds, findSceneNode, sceneContext } from "../address";
import { KERNEL_REPLACE } from "../command-bridge";
import { isUnstartedScene } from "../unstarted-scene";

export const sceneNumbersKey = new PluginKey<SceneNumbersState>("scenephonie/sceneNumbers");

interface SceneNumbersState {
  /** 游標所在那一場鎖住的自動草稿值；還沒有人進過任何一場是 `null`。 */
  hold: DraftHold | null;
  /** 最近一筆是 kernel command 的整份 replace —— 那之後的游標位置是程式搬的，不算編劇移動。 */
  afterKernel: boolean;
}

/**
 * 編輯器畫面上的場次號（套上「離開時才判定」的鎖）。編輯器裡任何要印場次號的地方都讀這一支，
 * 才不會 gutter 印 `2`、選單卻列 `S1[D1]`。
 */
export function editorSceneNumbers(state: EditorState): SceneNumber[] {
  return projectScenesWhileEditing(state.doc, sceneNumbersKey.getState(state)?.hold ?? null);
}

/** 焦點進了 `sceneId` 那一場：跟目前鎖住的不同才發一筆 meta（值是 sceneId，不進 history）。 */
function enter(view: EditorView, sceneId: string) {
  if (sceneNumbersKey.getState(view.state)?.hold?.sceneId === sceneId) return;
  view.dispatch(view.state.tr.setMeta(sceneNumbersKey, sceneId).setMeta("addToHistory", false));
}

/** 進場時鎖住的值：還沒開工的一場等同剛新增（正式），其餘鎖住當下的自動草稿原因。 */
function holdOn(doc: PMNode, sceneId: string): DraftHold {
  const scene = findSceneNode(doc, sceneId)?.node;
  return { sceneId, autoDraft: scene && isUnstartedScene(scene) ? false : autoDraftOf(doc, sceneId) };
}

/** 焦點在內文時，游標所在的那一場（片段算它的成員）。焦點不在內文回 `null`。 */
function caretScene(view: EditorView): string | null {
  if (view.dom.ownerDocument.activeElement !== view.dom) return null;
  return sceneContext(view.state.selection.$from)?.sceneId ?? null;
}

export interface SceneNumberSpec {
  /** 推導出來的顯示序號（字串；草稿是 `S11[D1]`），未知時為 "?"。 */
  sceneNo: string;
  /** 是不是草稿（推導的，票券 14）—— node view 據此掛視覺區隔。 */
  draft: boolean;
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

/** 群組的 decoration spec：整個群組是不是被選取範圍蓋住（群組 node view 據此畫反白）。 */
export interface GroupSelectionSpec {
  groupSelected: boolean;
}

/** 給群組的 node view 用：它是不是整個被選起來了。 */
export function groupSelectedOf(decorations: readonly Decoration[]): boolean {
  return decorations.some((d) => (d.spec as Partial<GroupSelectionSpec> | undefined)?.groupSelected === true);
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
    let cache: {
      doc: PMNode;
      from: number;
      to: number;
      hold: DraftHold | null;
      set: DecorationSet;
    } | null = null;

    return [
      new Plugin<SceneNumbersState>({
        key: sceneNumbersKey,
        state: {
          init: () => ({ hold: null, afterKernel: false }),
          apply: (tr, value, oldState, newState) => {
            const entered = tr.getMeta(sceneNumbersKey) as string | undefined;
            if (entered) return { hold: holdOn(newState.doc, entered), afterKernel: false };
            // kernel replace 之後 append 的修復（id 去重、片段正規化）仍算同一下。
            const afterKernel = tr.getMeta("appendedTransaction")
              ? value.afterKernel
              : Boolean(tr.getMeta(KERNEL_REPLACE));
            // 新建的場次起步是正式：只有 kernel command 鑄得出新 id。undo／redo、貼上都不是
            // 「新增」—— redo 一個 `/next` 與 undo 一次刪除分不出來，兩者都是把舊的帶回來。
            if (tr.docChanged && tr.getMeta(KERNEL_REPLACE)) {
              const before = new Set(allSceneIds(oldState.doc));
              const born = allSceneIds(newState.doc).find((id) => !before.has(id));
              if (born) return { hold: { sceneId: born, autoDraft: false }, afterKernel };
            }
            return value.afterKernel === afterKernel ? value : { ...value, afterKernel };
          },
        },
        // 內文的游標移進別場。在 `update` 裡不能同步 dispatch，排到 microtask。
        view: () => ({
          update: (view) => {
            const state = sceneNumbersKey.getState(view.state);
            if (!state || state.afterKernel) return;
            const sceneId = caretScene(view);
            if (!sceneId || sceneId === state.hold?.sceneId) return;
            queueMicrotask(() => {
              if (!view.isDestroyed && caretScene(view) === sceneId) enter(view, sceneId);
            });
          },
        }),
        props: {
          handleDOMEvents: {
            // 焦點進某一場的 chip row；或從外面回到內文（selection 沒變，`update` 不會跑）。
            focusin: (view, event) => {
              const target = event.target as HTMLElement;
              if (target === view.dom) {
                // bridge 在 kernel replace 之後的 `view.focus()` 不算 —— 游標是被搬過去的。
                const sceneId = sceneNumbersKey.getState(view.state)?.afterKernel ? null : caretScene(view);
                if (sceneId) enter(view, sceneId);
                return false;
              }
              const sceneId =
                target.closest(".scene__chips")?.closest<HTMLElement>("[data-scene-id]")?.dataset.sceneId;
              if (sceneId) enter(view, sceneId);
              return false;
            },
          },
          decorations: (state) => {
            const { from, to } = state.selection;
            const hold = sceneNumbersKey.getState(state)?.hold ?? null;
            if (
              cache &&
              cache.doc === state.doc &&
              cache.from === from &&
              cache.to === to &&
              cache.hold === hold
            ) {
              return cache.set;
            }

            const bySceneId = new Map(editorSceneNumbers(state).map((s) => [s.sceneId, s] as const));

            const decos: Decoration[] = [];
            const last = state.doc.childCount - 1;
            const push = (
              node: PMNode,
              pos: number,
              spec: Omit<SceneNumberSpec, "sceneNo" | "draft" | "selected">,
            ) => {
              const projected = bySceneId.get(node.attrs.sceneId as string);
              const label = projected?.label ?? "?";
              const covered = from <= pos && to >= pos + node.nodeSize;
              decos.push(
                Decoration.node(
                  pos,
                  pos + node.nodeSize,
                  { "data-scene-no": label },
                  {
                    sceneNo: label,
                    draft: projected?.draft ?? false,
                    selected: covered,
                    ...spec,
                  } satisfies SceneNumberSpec,
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
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {}, {
                  groupSelected: from <= pos && to >= pos + node.nodeSize,
                } satisfies GroupSelectionSpec),
              );
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
                    memberNo: bySceneId.get(member.node.attrs.sceneId as string)?.label ?? "?",
                    location: sceneLocationLabel(member.node),
                  } satisfies FragmentLabelSpec),
                );
                pushSubscenes(child, at, member.node);
              });
            });

            const set = DecorationSet.create(state.doc, decos);
            cache = { doc: state.doc, from, to, hold, set };
            return set;
          },
        },
      }),
    ];
  },
});
