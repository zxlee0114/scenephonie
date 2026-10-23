/**
 * 拖曳排序（票券 13、§7.5）—— 場次、子場次、群組、區塊，**可以跨層**。
 *
 * **刻意不走 ProseMirror 內建的拖放**：場次是 `isolating`，內建行為會擋掉跨場次搬區塊；而
 * `isolating` 要留著 —— 它保護的是鍵盤選取、刪除與貼上，那些才是會把兩場合併、讓 `sceneId` 錨點
 * 消失的路徑（§7.5 成本 1）。拖曳是明確的使用者意圖，不是誤觸，所以落點自己算、寫入走 kernel
 * command（`moveScene`／`moveBlock`／`moveGroup`），⌘Z 一步回來。
 *
 * **跟 ProseMirror 搶事件**（§7.5 成本 3、§7.7「拖曳吃字、跑版、偶爾拖不動」）—— 監聽掛在
 * `view.dom` 的 **capture** 階段，不走 `handleDOMEvents`：
 * - Tiptap 的 React node view 對落在 chrome（chip row）上的拖曳事件 `stopEvent` 回 true，那些
 *   事件根本進不了 ProseMirror 的 handler —— 掛在 PM 裡的話，滑過 chip row 的 `dragover` 就收不到；
 * - capture 階段先跑、`stopPropagation()` 之後 PM 自己的 `dragstart`／`drop` 不會再跑，不會出現
 *   「我們搬了一次、PM 又照它的 `view.dragging` 搬一次」；
 * - 拖曳期間 `dragover`／`drop` **一律 `preventDefault()`**，不合法的落點改用 `dropEffect = "none"`
 *   表達 —— 少了 preventDefault，瀏覽器會執行預設放置（把內容插進 contenteditable 再刪來源）；
 * - 落點**從 drop 事件重算**，不讀指示線的狀態：滑過子元素就會發一次 `dragleave`，讀狀態的版本
 *   會在那個空窗提早 return（原型踩過）。`dragleave` 只在真的離開編輯器時才收線。
 *
 * 落點合法性住在 `../drop-intent`（問 kernel，不在這裡重寫規則）。這裡只把 DOM 翻成落點：
 * 滑鼠底下**最內層**的區塊／子場次／主場次／群組，以它矩形的上下半決定前後。
 */
"use client";

import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import {
  deleteBlock,
  dissolveGroup,
  docFromJSON,
  movedBlockLocation,
  type BlockLocation,
  type SubsceneKind,
} from "@scenephonie/schema";

import { sceneContext, type BlockAddress } from "../address";
import { BLOCK_CYCLE, BLOCK_META, setBlockTypeAt } from "../block-types";
import { runKernelCommand } from "../command-bridge";
import {
  resolveDrop,
  runIntent,
  type DragPayload,
  type DropIntent,
  type DropSide,
  type DropZone,
} from "../drop-intent";
import { HANDLE_SELECTOR } from "../nodes/drag-handle";
import type { MenuRow } from "../scene-menu";
import { closePointMenu, isMenuAnchor, pointMenus } from "../point-menu";
import { scrollParentOf, visibleBoundsOf } from "../scroll-parent";

/** 落點元素：最內層的那一個勝出。群組成員的 chip row 算群組的外框（成員不單獨進出群組）。 */
const ZONE_SELECTOR = ".block, .scene, .scene-group";

function zoneElement(view: EditorView, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  let el = target.closest<HTMLElement>(ZONE_SELECTOR);
  if (el?.classList.contains("scene--member")) el = el.closest<HTMLElement>(".scene-group");
  return el && view.dom.contains(el) ? el : null;
}

/** 內容洞的 doc 座標 → resolved pos（DOM 不在 doc view 裡時 PM 會 throw）。 */
function resolveContent(view: EditorView, content: Element | null) {
  if (!content) return null;
  try {
    return view.state.doc.resolve(view.posAtDOM(content, 0));
  } catch {
    return null;
  }
}

const containerOf = (ctx: { sceneId: string; fragmentIndex?: number }) =>
  ctx.fragmentIndex == null ? { sceneId: ctx.sceneId } : { sceneId: ctx.sceneId, fragmentIndex: ctx.fragmentIndex };

/** 一個落點元素指的是什麼（區塊與子場次以「所屬那段內容 ＋ 序」定址，同 kernel）。 */
function zoneOf(view: EditorView, el: HTMLElement): DropZone | null {
  if (el.classList.contains("block")) {
    const $pos = resolveContent(view, el.querySelector(".block__content"));
    const ctx = $pos && sceneContext($pos);
    return ctx ? { kind: "block", container: containerOf(ctx), index: ctx.blockIndex } : null;
  }
  if (el.classList.contains("scene--sub")) {
    const $pos = resolveContent(view, el.querySelector(".scene__body"));
    if (!$pos) return null;
    const host = sceneContext(view.state.doc.resolve($pos.before()));
    const sceneId = $pos.parent.attrs.sceneId as string;
    return host ? { kind: "subscene", sceneId, host: containerOf(host), index: host.blockIndex } : null;
  }
  if (el.classList.contains("scene")) {
    const sceneId = el.dataset.sceneId;
    return sceneId ? { kind: "scene", sceneId } : null;
  }
  const groupId = el.dataset.groupId;
  return groupId ? { kind: "group", groupId } : null;
}

/** 從把手所在的落點元素，反推拖起來的是什麼。 */
function payloadOf(zone: DropZone): DragPayload {
  switch (zone.kind) {
    case "block":
      return { kind: "block", from: { ...zone.container, blockIndex: zone.index } };
    case "subscene":
    case "scene":
      return { kind: "scene", sceneId: zone.sceneId };
    case "group":
      return { kind: "group", groupId: zone.groupId };
  }
}

const sideOf = (el: HTMLElement, clientY: number): DropSide => {
  const r = el.getBoundingClientRect();
  return clientY < r.top + r.height / 2 ? "before" : "after";
};

/** 放下之後游標落在搬過去的那一個的開頭 —— 編劇的視線跟著它走，捲動也不會跳到別處。 */
function caretAfter(doc: PMNode, intent: DropIntent): BlockAddress | undefined {
  if (intent.command === "moveScene") return { sceneId: intent.options.sceneId, blockIndex: 0 };
  if (intent.command === "moveBlock") return movedBlockLocation(doc, intent.options) ?? undefined;
  let first: string | undefined;
  doc.forEach((top) => {
    if (top.attrs.groupId !== intent.options.groupId) return;
    top.forEach((child) => {
      if (!first && child.type.name === "groupFragment") first = child.attrs.memberId as string;
    });
  });
  return first ? { sceneId: first, fragmentIndex: 0, blockIndex: 0 } : undefined;
}

// ── 點把手：選起那個節點、開選單 ───────────────────────────────────────────────
// 場次（主場次、子場次）的把手就是場次號，它自己開 SceneMenu（`../nodes/scene`）；這裡管區塊與群組。

/** 刪掉第 `index` 個區塊之後游標去哪：補上來的那一個的開頭；刪的是最後一個就去前一個的末端。 */
function caretAfterDelete(at: BlockLocation, count: number) {
  const last = at.blockIndex >= count - 1 && at.blockIndex > 0;
  return {
    caretAt: { ...at, blockIndex: last ? at.blockIndex - 1 : at.blockIndex },
    caretPlace: last ? ("end" as const) : ("start" as const),
  };
}

function blockMenu(editor: Editor, view: EditorView, el: HTMLElement, at: BlockLocation): MenuRow[] | null {
  const $pos = resolveContent(view, el.querySelector(".block__content"));
  if (!$pos) return null;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, $pos.before())));
  const count = $pos.node(-1).childCount;
  return [
    ...BLOCK_CYCLE.filter((type) => type !== $pos.parent.type.name).map((type) => ({
      key: type,
      label: `轉成${BLOCK_META[type].label}`,
      run: () => setBlockTypeAt(editor, at, type),
    })),
    {
      key: "delete",
      label: "刪除這一行",
      run: () => runKernelCommand(editor, (doc) => deleteBlock(doc, at), caretAfterDelete(at, count)),
    },
  ];
}

function groupMenu(editor: Editor, view: EditorView, groupId: string): MenuRow[] | null {
  let at: number | null = null;
  view.state.doc.forEach((top, offset) => {
    if (top.attrs.groupId === groupId) at = offset;
  });
  if (at == null) return null;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
  return [
    {
      key: "dissolve",
      label: "解散對剪（全部變回普通場次）",
      run: () => runKernelCommand(editor, (doc) => dissolveGroup(doc, { groupId })),
    },
  ];
}

// ── 拖到邊緣自動捲動 ────────────────────────────────────────────────────────

/** 離捲動區上下緣多近開始捲（px）。 */
const EDGE = 56;
/** 每一格（一個 animation frame）最多捲幾 px。 */
const MAX_STEP = 18;

/**
 * 指標在 `y` 時這一格要捲多少（負的往上）：進到離邊緣 `EDGE` 以內才捲，越靠邊越快，
 * 拖出捲動區外面以最快速度捲。`top`／`bottom` 是捲動區在視窗裡**看得到**的範圍。
 */
export function edgeScrollStep(y: number, top: number, bottom: number): number {
  const ramp = (depth: number) => Math.round(MAX_STEP * Math.min(1, Math.max(0, depth) / EDGE));
  if (y < top + EDGE) return -ramp(top + EDGE - y);
  if (y > bottom - EDGE) return ramp(y - (bottom - EDGE));
  return 0;
}

/**
 * 拖曳期間追著指標的縱座標捲動。`dragover` 只在指標停在落點上時才發，所以座標從 document
 * 收（指標在 header 上、編輯器外面也收得到），捲動交給 animation frame 連續跑。
 */
function edgeScroller(view: EditorView) {
  let y: number | null = null;
  let frame = 0;
  const track = (e: DragEvent) => {
    y = e.clientY;
  };
  const tick = () => {
    const scroller = scrollParentOf(view.dom);
    const { top, bottom } = visibleBoundsOf(scroller);
    const step = y == null ? 0 : edgeScrollStep(y, top, bottom);
    if (step) scroller.scrollBy(0, step);
    frame = requestAnimationFrame(tick);
  };
  return {
    start() {
      y = null;
      document.addEventListener("dragover", track, true);
      frame = requestAnimationFrame(tick);
    },
    stop() {
      document.removeEventListener("dragover", track, true);
      cancelAnimationFrame(frame);
    },
  };
}

// ── 拖曳期間 ────────────────────────────────────────────────────────────────

interface Session {
  readonly payload: DragPayload;
  /** dragstart 當下的 doc（kernel schema）—— 拖曳期間試跑 command 都用它，不必每次轉一份。 */
  readonly doc: PMNode;
  /** 同一個落點的同一半只問 kernel 一次（`dragover` 每 50ms 一發）。 */
  readonly verdicts: Map<string, DropIntent | null>;
}

/**
 * 落點指示線 —— 全編輯器只有一條（每個節點各自存狀態會留下清不掉的殘影，原型踩過）。
 * `position: fixed` 用視窗座標畫，`pointer-events: none` 才不會變成自己的落點。
 */
function createIndicator(): HTMLElement {
  const line = document.createElement("div");
  line.className = "drop-indicator";
  line.hidden = true;
  line.setAttribute("aria-hidden", "true");
  document.body.append(line);
  return line;
}

function dragController(editor: Editor, view: EditorView) {
  let session: Session | null = null;
  const line = createIndicator();
  const autoscroll = edgeScroller(view);

  const hideLine = () => {
    line.hidden = true;
  };
  const showLine = (el: HTMLElement, side: DropSide) => {
    const r = el.getBoundingClientRect();
    line.style.top = `${side === "before" ? r.top : r.bottom}px`;
    line.style.left = `${r.left}px`;
    line.style.width = `${r.width}px`;
    line.hidden = false;
  };
  const end = () => {
    session = null;
    hideLine();
    autoscroll.stop();
  };

  /** 這個事件底下的落點與它要做的事；不合法、放回原地或不在落點上都是 `null`。 */
  const verdict = (e: DragEvent) => {
    if (!session) return null;
    const el = zoneElement(view, e.target);
    const zone = el && zoneOf(view, el);
    if (!el || !zone) return null;
    const side = sideOf(el, e.clientY);
    const key = `${JSON.stringify(zone)}|${side}`;
    if (!session.verdicts.has(key)) {
      session.verdicts.set(key, resolveDrop(session.doc, session.payload, zone, side));
    }
    const intent = session.verdicts.get(key)!;
    return intent ? { el, side, intent } : null;
  };

  const run = (intent: DropIntent, kind?: SubsceneKind) => {
    const caretAt = caretAfter(docFromJSON(editor.state.doc.toJSON()) as unknown as PMNode, intent);
    runKernelCommand(editor, (doc) => runIntent(doc, intent, kind), caretAt ? { caretAt } : {});
  };

  const handlers: Record<string, (e: DragEvent) => void> = {
    // 把手上的 mousedown 不交給 PM：否則它會先把游標或節點選取搬到把手那裡。
    mousedown: (e) => {
      if ((e.target as Element | null)?.closest?.(HANDLE_SELECTOR)) e.stopPropagation();
    },
    // 點（沒拖）＝ 選起那個節點、開選單（同 Notion）。拖過的不會有 click。
    click: (e) => {
      const handle = (e.target as Element | null)?.closest?.(HANDLE_SELECTOR);
      const el = handle && zoneElement(view, handle);
      const zone = el && zoneOf(view, el);
      if (!handle || !zone || zone.kind === "scene" || zone.kind === "subscene") return;
      e.preventDefault();
      e.stopPropagation();
      if (isMenuAnchor(handle)) return closePointMenu(); // 再點一次 ＝ 收起
      const rows =
        zone.kind === "block"
          ? blockMenu(editor, view, el, { ...zone.container, blockIndex: zone.index })
          : groupMenu(editor, view, zone.groupId);
      if (rows) pointMenus.set({ anchor: handle as HTMLElement, rows, onClose: () => view.focus() });
    },
    dragstart: (e) => {
      const handle = (e.target as Element | null)?.closest?.(HANDLE_SELECTOR);
      if (!handle) return; // 拖選取的文字之類 —— PM 原生行為照舊
      e.stopPropagation();
      const el = zoneElement(view, handle);
      const zone = el && zoneOf(view, el);
      if (!el || !zone) {
        e.preventDefault();
        return;
      }
      session = {
        payload: payloadOf(zone),
        doc: docFromJSON(view.state.doc.toJSON()) as unknown as PMNode,
        verdicts: new Map(),
      };
      autoscroll.start();
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ""); // Firefox 不設 data 就不會啟動拖曳
        e.dataTransfer.setDragImage(el, 0, 0);
      }
    },
    dragover: (e) => {
      if (!session) return;
      e.preventDefault();
      e.stopPropagation();
      const found = verdict(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = found ? "move" : "none";
      if (found) showLine(found.el, found.side);
      else hideLine();
    },
    dragleave: (e) => {
      if (!session) return;
      const to = e.relatedTarget as Node | null;
      if (!to || !view.dom.contains(to)) hideLine();
    },
    drop: (e) => {
      if (!session) return;
      // 先攔下瀏覽器的預設放置，再決定要不要搬 —— 順序不能反。
      e.preventDefault();
      e.stopPropagation();
      const found = verdict(e);
      end();
      if (!found) return;
      const { intent } = found;
      if (intent.command === "moveScene" && intent.demote) {
        // 落點是對著放下那一刻的 doc 算的：選單開著時 doc 若變了（序可能移位），這一筆就作廢。
        const dropped = view.state.doc;
        const choose = (kind: SubsceneKind) => () => {
          if (view.state.doc === dropped) run(intent, kind);
        };
        pointMenus.set({
          anchor: { x: e.clientX, y: e.clientY },
          rows: [
            { key: "insert", label: "改成插入戲", run: choose("插入") },
            { key: "continue", label: "改成接續", run: choose("接續") },
          ],
          onClose: () => view.focus(),
        });
        return;
      }
      run(intent);
    },
    // 來源節點在 drop 後可能已經被整份 replace 換掉，dragend 不一定回得來 —— drop 自己會收尾。
    dragend: end,
  };

  for (const [type, handler] of Object.entries(handlers)) {
    view.dom.addEventListener(type, handler as EventListener, true);
  }

  return {
    destroy() {
      for (const [type, handler] of Object.entries(handlers)) {
        view.dom.removeEventListener(type, handler as EventListener, true);
      }
      line.remove();
      autoscroll.stop();
      pointMenus.set(null);
    },
  };
}

export const dragReorderKey = new PluginKey("dragReorder");

export const DragReorder = Extension.create({
  name: "dragReorder",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({ key: dragReorderKey, view: (view) => dragController(editor, view) })];
  },
});
