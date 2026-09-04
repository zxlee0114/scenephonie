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
import { useSyncExternalStore } from "react";

import type { BlockType } from "@scenephonie/schema";

import { sceneContext } from "../address";
import { BLOCK_META, setBlockTypeAt } from "../block-types";
import { requestNextScene } from "./next-scene";

type SlashItem = {
  key: string;
  label: string;
  hint: string;
  run: (editor: Editor, range: Range) => void;
};

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
      editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
      requestNextScene(editor);
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

type MenuState = { open: boolean; items: SlashItem[]; index: number; rect: DOMRect | null };

let menu: MenuState = { open: false, items: [], index: 0, rect: null };
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

  if (!state.open || !state.rect || state.items.length === 0) return null;

  return (
    <div className="slash-menu" style={{ top: state.rect.bottom + 6, left: state.rect.left }}>
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
              rect: props.clientRect?.() ?? null,
            });
          },
          onUpdate: (props) => {
            patchMenu({ items: props.items, index: 0, rect: props.clientRect?.() ?? null });
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
            patchMenu({ open: false, items: [], rect: null });
          },
        }),
      }),
    ];
  },
});
