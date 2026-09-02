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

import { setBlockType, type BlockType } from "@scenephonie/schema";

import { runKernelCommand } from "../command-bridge";
import { requestNextScene } from "./next-scene";

type SlashItem = {
  key: string;
  label: string;
  hint: string;
  run: (editor: Editor, range: Range) => void;
};

const BLOCK_LABEL: Record<BlockType, string> = {
  action: "動作",
  dialogue: "對白",
  insertShot: "插入畫面",
};

function locate(editor: Editor, at: number): { sceneId: string; blockIndex: number } | null {
  const $pos = editor.state.doc.resolve(at);
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "scene") {
      return { sceneId: $pos.node(d).attrs.sceneId as string, blockIndex: $pos.index(d) };
    }
  }
  return null;
}

function convertBlock(editor: Editor, range: Range, type: BlockType) {
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
  const target = locate(editor, editor.state.selection.from);
  if (!target) return;
  runKernelCommand(
    editor,
    (doc) => setBlockType(doc, { ...target, type }),
    type === "dialogue" ? { focusField: { kind: "speaker", ...target } } : { caretAt: target },
  );
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
    label: BLOCK_LABEL.insertShot,
    hint: "場次內部的單一畫面，不產生新場次",
    run: (editor, range) => convertBlock(editor, range, "insertShot"),
  },
  {
    key: "dialogue",
    label: BLOCK_LABEL.dialogue,
    hint: "也可以按 Tab 切換",
    run: (editor, range) => convertBlock(editor, range, "dialogue"),
  },
  {
    key: "action",
    label: BLOCK_LABEL.action,
    hint: "也可以按 Tab 切換",
    run: (editor, range) => convertBlock(editor, range, "action"),
  },
];

// ── 選單狀態（external store，畫在編輯器外層）──────────────────────────

type MenuState = { open: boolean; items: SlashItem[]; index: number; rect: DOMRect | null };

let menu: MenuState = { open: false, items: [], index: 0, rect: null };
let pick: ((item: SlashItem) => void) | null = null;
const listeners = new Set<() => void>();

const set = (next: Partial<MenuState>) => {
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
          onMouseEnter={() => set({ index: i })}
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
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return ITEMS.filter((i) => i.key.startsWith(q) || i.label.includes(query));
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => {
            pick = (item) => props.command(item);
            set({ open: true, items: props.items, index: 0, rect: props.clientRect?.() ?? null });
          },
          onUpdate: (props) => {
            set({ items: props.items, index: 0, rect: props.clientRect?.() ?? null });
          },
          onKeyDown: ({ event }) => {
            if (!menu.open) return false;
            if (event.isComposing) return false; // 組字期間完全不動作
            if (event.key === "Escape") {
              set({ open: false });
              return true;
            }
            if (event.key === "ArrowDown") {
              set({ index: (menu.index + 1) % menu.items.length });
              return true;
            }
            if (event.key === "ArrowUp") {
              set({ index: (menu.index - 1 + menu.items.length) % menu.items.length });
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
            set({ open: false, items: [], rect: null });
          },
        }),
      }),
    ];
  },
});
