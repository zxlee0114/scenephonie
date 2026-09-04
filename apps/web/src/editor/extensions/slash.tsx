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
import Suggestion from "@tiptap/suggestion";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import type { BlockType } from "@scenephonie/schema";

import { sceneContext } from "../address";
import { BLOCK_META, setBlockTypeAt } from "../block-types";
import { dismissOnOutsidePointer } from "../dismiss-on-outside-pointer";
import { slashMenuPosition } from "../slash-menu-position";
import { currentSceneId, requestNextScene } from "./next-scene";

type SlashItem = {
  key: string;
  label: string;
  hint: string;
  run: (editor: Editor, range: Range) => void;
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
  if (scene.type.name !== "scene" || scene.childCount <= 1) return;

  editor.view.dispatch(state.tr.delete($from.before(), $from.after()));
}

function convertBlock(editor: Editor, range: Range, type: BlockType) {
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
  const ctx = sceneContext(editor.state.selection.$from);
  if (!ctx) return;
  setBlockTypeAt(editor, { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex }, type);
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    return dismissOnOutsidePointer(el, () => patchMenu({ open: false }));
  }, [open]);

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
        items: ({ query }) => {
          const q = query.toLowerCase();
          return ITEMS.filter((i) => i.key.startsWith(q) || i.label.includes(query));
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => {
            pick = (item) => props.command(item);
            patchMenu({
              open: true,
              items: props.items,
              index: 0,
              caret: props.clientRect ?? null,
            });
          },
          onUpdate: (props) => {
            patchMenu({ items: props.items, index: 0, caret: props.clientRect ?? null });
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
            patchMenu({ open: false, items: [], caret: null });
          },
        }),
      }),
    ];
  },
});
