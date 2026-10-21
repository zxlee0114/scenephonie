/**
 * `/` 斜線選單 —— Notion 式，但**只有「新增下一場」真的需要它**（§7.2）。動作／對白之間的切換
 * 走 Tab（交替太頻繁，每次打指令會毀掉心流）；選單裡仍列出三種區塊，那是給忘記快捷鍵的人的
 * 後路。指令叫 `/next` 不叫 `/scene`：你永遠在某個場次裡打字，「在場次裡建立場次」語意很怪。
 *
 * **注音組字期間，選單完全不動作**（§7.6 / 驗收項 3）：`@tiptap/suggestion` 本身在 `view.composing`
 * 時不推進，`onKeyDown` 這裡再對 `event.isComposing` 明確 return false 作為縱深。
 */
"use client";

import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  canCreateSubscene,
  canIntercut,
  createSubscene,
  intercutTo,
  projectScenes,
  sceneLocationLabel,
  type BlockType,
  type SubsceneAnchor,
  type SubsceneKind,
} from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

import {
  blockAddressOf,
  firstFragmentText,
  forEachScene,
  isSceneNode,
  sceneContext,
} from "../address";
import { runKernelCommand } from "../command-bridge";
import { BLOCK_META, setBlockTypeAt } from "../block-types";
import { dismissOnOutsidePointer } from "../dismiss-on-outside-pointer";
import { slashMenuPosition } from "../slash-menu-position";
import { currentSceneId, requestNextScene } from "./next-scene";
import { returnMarkerText } from "./return-markers";
import { exitSubscene, subsceneDepth } from "./subscene-exit";

/**
 * 選單的一列。`next` 的那一列不直接執行，而是把選單換成**第二步**的清單（`/insert`／
 * `/continue-to` 的「套用哪一場的時空」）—— 還在同一個選單裡、同一顆 Enter，指令字也還留在
 * 文件裡，繼續打字就回到第一步。
 */
type SlashItem = {
  key: string;
  label: string;
  hint: string;
  run?: (editor: Editor, range: Range) => void;
  next?: (editor: Editor) => SlashItem[];
};

/**
 * 收掉承載 `/next` 的空區塊。
 *
 * 指令文字刪掉之後，那個區塊多半就沒有存在理由了 —— 使用者是為了打指令才按 Enter 開的那一行。
 * 其他 slash 指令沒有這個問題：它們把你正站著的區塊**轉型**，那個區塊本來就該留下。
 *
 * 兩種情形不能收：區塊裡還有內容（「內文 /next」刪完剩「內文 」），或它是本場唯一的區塊
 * （kernel schema 的 `scene` 是 `sceneBlock+`，場次不能沒有內容）。
 */
function dropEmptyCommandBlock(editor: Editor) {
  const { state } = editor;
  const { $from } = state.selection;
  if ($from.parent.content.size > 0) return;

  const scene = $from.node($from.depth - 1);
  if (!(isSceneNode(scene) || scene.type.name === "groupFragment") || scene.childCount <= 1) return;
  // 主場次的第一個孩子不能換成子場次（不變式 ①）—— 收掉它會讓後面那個子場次變成第一個。
  if ($from.index($from.depth - 1) === 0 && scene.child(1).type.name === "subscene") return;

  editor.view.dispatch(state.tr.delete($from.before(), $from.after()));
}

/**
 * `/insert`／`/continue-to` 從游標這裡建子場次時，kernel 要的定址（`createSubscene` 的
 * `SubsceneAnchor`），以及承載指令的那一行要不要收掉。
 *
 * 判斷「這一行有沒有內容」要**扣掉指令字本身** —— 選單還開著時 `/insert` 這幾個字還在區塊裡。
 * 扣完是空的：這一行只是為了打指令才開的，收掉，子場次接在上一個孩子之後；還有字（`客廳。/insert`）：
 * 留著，子場次接在它之後。在子場次裡按下去一律是「接在這個子場次之後的兄弟」（語意不變）。
 */
function subsceneAnchorAtCaret(editor: Editor): { anchor: SubsceneAnchor; drop: boolean } | null {
  const { $from } = editor.state.selection;
  const ctx = sceneContext($from);
  if (!ctx) return null;
  const container = $from.node(ctx.sceneDepth);

  const before = $from.parent.textBetween(0, $from.parentOffset);
  const slash = before.lastIndexOf("/");
  const leftover =
    (slash >= 0 ? before.slice(0, slash) : before) +
    $from.parent.textBetween($from.parentOffset, $from.parent.content.size);
  const blank = leftover.trim() === "";

  if (container.type.name === "subscene") {
    return {
      anchor: { sceneId: ctx.sceneId, afterBlockIndex: 0 },
      drop: blank && container.childCount > 1,
    };
  }
  return {
    anchor: {
      sceneId: ctx.sceneId,
      ...(ctx.fragmentIndex == null ? {} : { fragmentIndex: ctx.fragmentIndex }),
      afterBlockIndex: blank ? ctx.blockIndex - 1 : ctx.blockIndex,
    },
    drop: blank,
  };
}

/** 空場次裡 `/insert`／`/continue-to` 不可用（不變式 ①）—— 不列出來，而不是按了才拒絕。 */
function subsceneAvailable(editor: Editor): boolean {
  const at = subsceneAnchorAtCaret(editor);
  return at != null && canCreateSubscene(editor.state.doc, at.anchor);
}

function createSubsceneAt(
  editor: Editor,
  range: Range,
  kind: SubsceneKind,
  applyFromSceneId: string | null,
) {
  // 定址先問清楚 —— 刪掉指令字、收掉空行之後 selection 就不再是這一行了。
  const at = subsceneAnchorAtCaret(editor);
  if (!at) return;
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
  if (at.drop) editor.view.dispatch(editor.state.tr.delete(
    editor.state.selection.$from.before(),
    editor.state.selection.$from.after(),
  ));
  runKernelCommand(
    editor,
    (doc) => createSubscene(doc, { ...at.anchor, kind, applyFromSceneId }),
    { focusNewSceneMeta: true },
  );
}

/** 一場的時空，選單上印成 `內景 公寓客廳 夜`（缺的欄位就不印）。 */
function spaceTimeOf(scene: PMNode): string {
  return [scene.attrs.intExt, sceneLocationLabel(scene), scene.attrs.time].filter(Boolean).join(" ");
}

/**
 * 第二步：套用哪一場的內外／時間／地點（§4.4 明確套用）。**第一項永遠是「不沿用，留空」** ——
 * metadata 完全不繼承主場次是預設，套用是編劇的明確選擇。三欄都還空著的場次沒有東西可套，不列。
 */
function applyStep(kind: SubsceneKind) {
  return (editor: Editor): SlashItem[] => {
    const byId = new Map<string, PMNode>();
    forEachScene(editor.state.doc, (node) => {
      byId.set(node.attrs.sceneId as string, node);
    });
    const rows: SlashItem[] = [
      {
        key: "apply:none",
        label: "不沿用，留空",
        hint: "從空白開始 —— 時空沒填完之前它是草稿",
        run: (e, range) => createSubsceneAt(e, range, kind, null),
      },
    ];
    for (const { sceneId, label } of projectScenes(editor.state.doc)) {
      const scene = byId.get(sceneId);
      const spaceTime = scene ? spaceTimeOf(scene) : "";
      if (!spaceTime) continue;
      rows.push({
        key: `apply:${sceneId}`,
        label: `${label}\u3000${spaceTime}`,
        hint: "套用內外／時間／地點（不含登場人物）",
        run: (e, range) => createSubsceneAt(e, range, kind, sceneId),
      });
    }
    return rows;
  };
}

/**
 * `/` →「對剪到…」從游標這裡建群組時的定址（`intercutTo` 的 `sceneId`／`fragmentIndex`）。游標
 * 在子場次裡也一樣 —— kernel 把它解讀成「在它的主場次裡按」。
 */
function intercutAnchorAtCaret(editor: Editor): { sceneId: string; fragmentIndex?: number } | null {
  const ctx = sceneContext(editor.state.selection.$from);
  if (!ctx) return null;
  return ctx.fragmentIndex == null
    ? { sceneId: ctx.sceneId }
    : { sceneId: ctx.sceneId, fragmentIndex: ctx.fragmentIndex };
}

function intercutAt(editor: Editor, range: Range, withSceneId: string | null) {
  const at = intercutAnchorAtCaret(editor);
  if (!at) return;
  // 指令字刪掉；那一行若只是為了打指令才開的，收掉（同 `/next`）。
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
  dropEmptyCommandBlock(editor);
  const ran = runKernelCommand(editor, (doc) => intercutTo(doc, { ...at, withSceneId }), {
    // 新的一場：焦點送進它的 chip row（先填時空，同 `/next`）。收編的那一場沒有新 id 可追。
    focusNewSceneMeta: withSceneId == null,
  });
  // 收編：游標送進它那一段的開頭 —— 編劇接下來要寫的是交錯，不是回頭改原本那一段。
  if (ran && withSceneId != null) {
    const pos = firstFragmentText(editor.state.doc, withSceneId);
    if (pos != null) editor.commands.setTextSelection(pos);
  }
}

/**
 * 第二步：跟誰對剪（§4.5，沿用 `/insert` 第二步的形狀）。**第一項是「建立新的一場」** —— 鑄造、
 * metadata 全空（「同時發生」不是交叉場次的定義，不繼承）。其餘是可以**收編**的既有頂層場次：
 * 寫到一半才發現兩場在交錯，它們早就各自寫好了（票券 15）。群組成員與子場次不列 —— 一個場次
 * 不能同時屬於兩個群組（不變式 ④），子場次不在場次序列上。
 */
function intercutStep(editor: Editor): SlashItem[] {
  const at = intercutAnchorAtCaret(editor);
  const rows: SlashItem[] = [
    {
      key: "intercut:new",
      label: "建立新的一場",
      hint: "另一個地方同時發生的戲 —— 時空沒填完之前它是草稿",
      run: (e, range) => intercutAt(e, range, null),
    },
  ];
  if (!at) return rows;
  const { doc } = editor.state;
  const labels = new Map(projectScenes(doc).map((s) => [s.sceneId, s.label] as const));
  doc.forEach((top) => {
    if (top.type.name !== "scene") return;
    const sceneId = top.attrs.sceneId as string;
    if (!canIntercut(doc, { ...at, withSceneId: sceneId })) return;
    rows.push({
      key: `intercut:${sceneId}`,
      label: `${labels.get(sceneId) ?? "?"}\u3000${spaceTimeOf(top) || "時空未填"}`,
      hint: "與這一場對剪 —— 它寫好的內容變成它的第一個片段",
      run: (e, range) => intercutAt(e, range, sceneId),
    });
  });
  return rows;
}

/** `/back-to` 那一列的標籤 —— 與畫面上的折返標記同一串字（「回到」＋主場次地點）。 */
function backToLabel(editor: Editor): string {
  const { $from } = editor.state.selection;
  const depth = subsceneDepth($from);
  return returnMarkerText(depth == null ? null : sceneLocationLabel($from.node(depth - 1)));
}

function convertBlock(editor: Editor, range: Range, type: BlockType) {
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
  const ctx = sceneContext(editor.state.selection.$from);
  if (!ctx) return;
  setBlockTypeAt(editor, blockAddressOf(ctx), type);
}

/**
 * 這一刻的選單。子場次那三列看游標在哪（ADR-0006 的表）：
 *
 * | 代號 | 標籤 | 建立什麼 |
 * |---|---|---|
 * | `/insert` | 插入戲 | `kind = 插入` 的子場次 |
 * | `/continue-to` | 接續到… | `kind = 接續` 的子場次 |
 * | `/back-to` | 回到 <主場次地點> | 不建立任何東西，游標跳回主場次 |
 * | `/intercut` | 對剪到… | 場次群組（票券 12）；在群組裡是加入一個成員 |
 *
 * 英文代號是因為 `/` 之後打中文要切輸入法；中文標籤仍是編劇看到的字。`/back-to` 只在子場次裡
 * 列出來 —— 在主場次裡沒有地方可「回到」。
 */
function slashItems(editor: Editor): SlashItem[] {
  const inSubscene = subsceneDepth(editor.state.selection.$from) != null;
  const subsceneRows: SlashItem[] = subsceneAvailable(editor)
    ? [
        {
          key: "insert",
          label: "插入戲",
          hint: "閃回、閃進、夢境 —— 另一段時空的戲",
          next: applyStep("插入"),
        },
        {
          key: "continue-to",
          label: "接續到…",
          hint: "連續動作走進另一個空間，中間沒有時間間隔",
          next: applyStep("接續"),
        },
      ]
    : [];
  const backRow: SlashItem[] = inSubscene
    ? [
        {
          key: "back-to",
          label: backToLabel(editor),
          hint: "不建立任何東西 —— 游標回到主場次（也可以在空行按 Enter）",
          run: (e, range) => {
            e.view.dispatch(e.state.tr.delete(range.from, range.to));
            exitSubscene(e);
          },
        },
      ]
    : [];
  // 「對剪到…」（票券 12）：建立群組，在群組裡則是加入一個成員。英文代號 `/intercut`。
  const at = intercutAnchorAtCaret(editor);
  const intercutRow: SlashItem[] =
    at && canIntercut(editor.state.doc, { ...at, withSceneId: null })
      ? [
          {
            key: "intercut",
            label: "對剪到…",
            hint: "兩個以上的地方同時發生、交替著讀",
            next: intercutStep,
          },
        ]
      : [];
  return [ITEMS[0]!, ...subsceneRows, ...backRow, ...intercutRow, ...ITEMS.slice(1)];
}

const ITEMS: SlashItem[] = [
  {
    key: "next",
    label: "新增下一場",
    hint: "時間或地點一變就是新的一場（⌘+Enter）",
    run: (editor, range) => {
      // 場次先問清楚 —— 收掉空區塊之後 selection 可能已經不在這一場裡，
      // `requestNextScene` 靠 selection 推算就會把新場次接到全劇最後面去。
      const afterSceneId = currentSceneId(editor);
      editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
      dropEmptyCommandBlock(editor);
      requestNextScene(editor, afterSceneId);
    },
  },
  {
    key: "shot",
    label: BLOCK_META.insertShot.label,
    hint: BLOCK_META.insertShot.hint,
    run: (editor, range) => convertBlock(editor, range, "insertShot"),
  },
  {
    key: "dialogue",
    label: BLOCK_META.dialogue.label,
    hint: BLOCK_META.dialogue.hint,
    run: (editor, range) => convertBlock(editor, range, "dialogue"),
  },
  {
    key: "action",
    label: BLOCK_META.action.label,
    hint: BLOCK_META.action.hint,
    run: (editor, range) => convertBlock(editor, range, "action"),
  },
];

// ── 選單狀態（external store，畫在編輯器外層）──────────────────────────

/**
 * `caret` 存的是 Suggestion 給的 `clientRect` **函式**而不是當下的 DOMRect：捲動或改變視窗大小
 * 之後要重新問一次，選單才不會與游標脫節（票券 29）。
 */
type MenuState = {
  open: boolean;
  items: SlashItem[];
  index: number;
  caret: (() => DOMRect | null) | null;
};

let menu: MenuState = { open: false, items: [], index: 0, caret: null };
let pick: ((item: SlashItem) => void) | null = null;

/**
 * 進了第二步之後的清單，與進去那一刻的指令字。之後再打的字（`/intercut河堤`）篩**第二步**，
 * 不是回頭篩第一步 —— 場次一多，第二步就得能打字找（驗收 2026-10-21）。刪回進去之前的字
 * （或換成別的指令）就退回第一步。
 */
let step: { query: string; items: SlashItem[] } | null = null;

/** 這一刻要畫的清單：在第二步裡就篩第二步，否則是 Suggestion 依指令字篩好的第一步。 */
function itemsFor(props: SuggestionProps<SlashItem>): SlashItem[] {
  if (step && props.query.startsWith(step.query)) {
    const rest = props.query.slice(step.query.length);
    return rest ? step.items.filter((i) => i.label.includes(rest)) : step.items;
  }
  step = null;
  return props.items;
}
const listeners = new Set<() => void>();

/** 合併一段 menu state 並通知訂閱者。 */
const patchMenu = (next: Partial<MenuState>) => {
  menu = { ...menu, ...next };
  listeners.forEach((l) => l());
};

export function SlashMenu() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => menu,
    () => menu,
  );

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { open, caret, items } = state;

  // 量到選單的實際尺寸才知道下方／右邊塞不塞得下，所以定位在 layout effect 裡做：先渲染
  // （這一幀用 visibility: hidden 藏著，避免閃一下），量完在上畫面之前把座標補上。
  // `caret` 與 `items` 每次 onStart／onUpdate 都是新的，項目變動改變高度時會重新算；
  // `open` 也要在 deps 裡 —— Escape 只把 open 關掉、caret 不變，少了它 cleanup 不會跑，
  // 捲動監聽器會留在已卸載的節點上。
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !caret || !open) {
      setPos(null);
      return;
    }
    let last: { top: number; left: number } | null = null;
    const place = () => {
      const rect = caret();
      // 選單還開著但 decoration 一時不在 DOM 裡（Tiptap 用 querySelector 找不到就回 null）：
      // 藏起來，比留在舊座標上假裝還貼著游標好。
      if (!rect) {
        last = null;
        setPos(null);
        return;
      }
      const next = slashMenuPosition(rect, el.getBoundingClientRect(), {
        // `documentElement.clientWidth/Height` 才是扣掉捲軸的可視區；`innerWidth` 會讓
        // 靠右夾限的選單躲到捲軸底下，吃掉留的那 8px。
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      });
      // 平滑捲動一幀一個事件，座標沒變就別重繪。
      if (last && last.top === next.top && last.left === next.left) return;
      last = next;
      setPos(next);
    };
    place();
    // capture 才收得到編輯器內層容器的捲動（打字時的 typewriter 捲動也走這裡）。
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, caret, items]);

  // 點選單外面就收起來 —— 和 Escape 走同一個出口（只關 UI，suggestion 之後自己 exit）。
  //
  // 這裡**不能**在 effect 執行的當下讀 `ref.current` 再據以決定要不要註冊：`open` 先變 true，
  // 而選單要等 suggestion 交出 `clientRect` 才畫得出來，那一幀 ref 還是 null；deps 只有 `open`
  // 就不會再跑第二次，監聽器於是從來沒被掛上（使用者回報 2026-09-04：點編輯器外部關不掉）。
  // 元素改成在事件當下才問。
  useLayoutEffect(() => {
    if (!open) return;
    return dismissOnOutsidePointer(
      () => ref.current,
      () => patchMenu({ open: false }),
    );
  }, [open]);

  // 清單比選單高時（場次一多，第二步就是這樣）：方向鍵走到哪，那一列就捲進來。
  useLayoutEffect(() => {
    ref.current?.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });
  }, [state.index, items]);

  if (!open || !caret || items.length === 0) return null;

  return (
    <div
      ref={ref}
      className="slash-menu"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? undefined : "hidden" }}
    >
      {state.items.map((item, i) => (
        <button
          key={item.key}
          className={i === state.index ? "is-active" : ""}
          onMouseEnter={() => patchMenu({ index: i })}
          onMouseDown={(e) => {
            e.preventDefault();
            pick?.(item);
          }}
        >
          <strong>{item.label}</strong>
          <span>{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 選到一列要做什麼。有第二步的列：換清單，不執行（指令字還留著，Esc 或繼續打字都回得去）。
 */
function pickFor(props: SuggestionProps<SlashItem>) {
  return (item: SlashItem) => {
    if (!item.next) return props.command(item);
    step = { query: props.query, items: item.next(props.editor) };
    patchMenu({ items: step.items, index: 0 });
  };
}

export const Slash = Extension.create({
  name: "slash",
  // ⚠️ 必須壓過 `continueBlock`（1101）與 `softBreak`（1100）：Tiptap 依 priority 由高到低把
  // 外掛排進 ProseMirror，`Enter` 會被先排到的那個吃掉。選單開著時 Enter 卻在換行，就是這個
  // 順序反了（使用者回饋 2026-09-03）。
  priority: 1200,
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        // `/` 只是**動作**區塊的指令入口。對白內文與插入畫面裡的斜線是內容（畫面比例、日期、
        // 台詞裡的停頓寫法），不該彈選單；要換型別走 Tab，要開下一場走 ⌘+Enter 或腳部按鈕。
        // 使用者回饋 2026-09-03。
        allow: ({ state }) => state.selection.$from.parent.type.name === "action",
        items: ({ query, editor }) => {
          const q = query.toLowerCase();
          return slashItems(editor).filter((i) => i.key.startsWith(q) || i.label.includes(query));
        },
        command: ({ editor, range, props }) => props.run?.(editor, range),
        render: () => ({
          // `pick` 每次都重新綁：Suggestion 的 `props.command` 帶的是**那一刻**的 range。只在
          // onStart 綁的話，打完 `/insert` 再按 Enter 只會刪掉 `/` 那一個字（range 停在起點）。
          onStart: (props) => {
            step = null;
            pick = pickFor(props);
            patchMenu({
              open: true,
              items: props.items,
              index: 0,
              caret: props.clientRect ?? null,
            });
          },
          onUpdate: (props) => {
            pick = pickFor(props);
            patchMenu({ items: itemsFor(props), index: 0, caret: props.clientRect ?? null });
          },
          onKeyDown: ({ event }) => {
            if (!menu.open) return false;
            if (event.isComposing) return false; // 組字期間完全不動作
            if (event.key === "Escape") {
              patchMenu({ open: false });
              return true;
            }
            if (event.key === "ArrowDown") {
              patchMenu({ index: (menu.index + 1) % menu.items.length });
              return true;
            }
            if (event.key === "ArrowUp") {
              patchMenu({ index: (menu.index - 1 + menu.items.length) % menu.items.length });
              return true;
            }
            if (event.key === "Enter") {
              const item = menu.items[menu.index];
              if (item) pick?.(item);
              return true;
            }
            return false;
          },
          onExit: () => {
            pick = null;
            step = null;
            patchMenu({ open: false, items: [], caret: null });
          },
        }),
      }),
    ];
  },
});
