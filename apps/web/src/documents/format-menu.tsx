/**
 * 反白後浮出的格式選單（票券 21 驗收，2026-10-24）。
 *
 * 富文本的每一樣都有 Markdown 捷徑與快捷鍵，但那要使用者先知道；畫面又要維持乾淨，所以格式只在
 * **選了字之後**才出現。選單裡就是這份文件能做的全部 —— 沒有的格式（底線、顏色、連結）不會出現在這裡。
 *
 * 分隔線不在選單裡：它不依附一段選取，打 `---` 就有。
 *
 * 按鈕的 `mousedown` 取消預設行為：預設會把焦點從編輯區拿走、選取跟著不見。動作本身照常掛在 `click`，
 * 鍵盤（Tab 進選單、Enter）也按得動。
 */
"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

type FormatState = {
  paragraph: boolean;
  heading2: boolean;
  heading3: boolean;
  bold: boolean;
  italic: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
};

/** 選單上的一顆。`label` 是畫面上的字，`name` 是給螢幕閱讀器與 tooltip 的完整名稱（含快捷鍵）。 */
type FormatButton = {
  key: keyof FormatState;
  label: string;
  name: string;
  run: (editor: Editor) => void;
};

/** 三組，中間一條分隔：這一段是什麼、字怎麼強調、要不要包成清單或引用。 */
const GROUPS: FormatButton[][] = [
  [
    { key: "paragraph", label: "內文", name: "內文", run: (e) => e.chain().focus().setParagraph().run() },
    { key: "heading2", label: "標題", name: "標題（## ）", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "heading3", label: "小標題", name: "小標題（### ）", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  ],
  [
    { key: "bold", label: "B", name: "粗體（⌘B）", run: (e) => e.chain().focus().toggleBold().run() },
    { key: "italic", label: "I", name: "斜體（⌘I）", run: (e) => e.chain().focus().toggleItalic().run() },
  ],
  [
    { key: "bulletList", label: "• 項目", name: "項目清單（- ）", run: (e) => e.chain().focus().toggleBulletList().run() },
    { key: "orderedList", label: "1. 編號", name: "編號清單（1. ）", run: (e) => e.chain().focus().toggleOrderedList().run() },
    { key: "blockquote", label: "引用", name: "引用（> ）", run: (e) => e.chain().focus().toggleBlockquote().run() },
  ],
];

export function FormatMenu({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }): FormatState => ({
      paragraph: e.isActive("paragraph") && !e.isActive("bulletList") && !e.isActive("orderedList") && !e.isActive("blockquote"),
      heading2: e.isActive("heading", { level: 2 }),
      heading3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
    }),
  });

  // `fixed`：放在會捲動的框裡（建立精靈的頁籤，票券 71）時，absolute 的選單會被框的 overflow 切掉一截。
  return (
    <BubbleMenu
      editor={editor}
      className="format-menu"
      role="toolbar"
      aria-label="格式"
      options={{ strategy: "fixed" }}
    >
      {GROUPS.map((group, index) => (
        <div key={index} className="format-menu__group">
          {group.map((button) => (
            <button
              key={button.key}
              type="button"
              className={`format-menu__button format-menu__button--${button.key}`}
              aria-label={button.name}
              title={button.name}
              aria-pressed={active[button.key]}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => button.run(editor)}
            >
              {button.label}
            </button>
          ))}
        </div>
      ))}
    </BubbleMenu>
  );
}
