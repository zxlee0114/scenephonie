/**
 * 反白後浮出的格式選單（票券 21 驗收，2026-10-24）。
 *
 * 富文本的每一樣都有 Markdown 捷徑與快捷鍵，但那要使用者先知道；畫面又要維持乾淨，所以格式只在
 * **選了字之後**才出現。選單裡就是這份文件能做的全部 —— 沒有的格式（底線、顏色、連結）不會出現在這裡。
 *
 * 分隔線不在選單裡：它不依附一段選取，打 `---` 就有。
 *
 * 選單只跟著**反白的字**出現：點把手選起一整位人物（人物介紹）不是在挑字的格式。
 *
 * 按鈕的 `mousedown` 取消預設行為：預設會把焦點從編輯區拿走、選取跟著不見。動作本身照常掛在 `click`，
 * 鍵盤（Tab 進選單、Enter）也按得動。
 */
"use client";

import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useMemo, useRef } from "react";

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

/**
 * `unavailable`：這份文件用不到、但要讓人看得到「這裡沒有」的那幾顆，灰掉不拿掉 —— 人物介紹的第二層標題是人物
 * 的名字（使用者裁決 2026-10-26），`reason` 寫在 tooltip 裡。
 */
export function FormatMenu({
  editor,
  unavailable = {},
}: {
  editor: Editor;
  unavailable?: Partial<Record<keyof FormatState, string>>;
}) {
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

  const menu = useRef<HTMLDivElement>(null);
  // `fixed`：放在會捲動的框裡（建立精靈的頁籤，票券 71）時，absolute 的選單會被框的 overflow 切掉一截。
  // 選單一開始是 Tiptap 掛上的 `position: absolute`，第一次算位置時 Floating UI 拿它的 offsetParent
  // （彈窗）當基準，算出來的座標卻當成視窗座標用 —— 第一次反白，選單跑到視窗左上角。出現的那一刻就先改成 fixed。
  // 物件要穩定：每次 render 一個新的 options，Tiptap 就重送一次 updateOptions。
  const options = useMemo(
    () => ({
      strategy: "fixed" as const,
      onShow: () => {
        if (menu.current) menu.current.style.position = "fixed";
      },
    }),
    [],
  );
  const shouldShow = useMemo(
    () =>
      ({ editor: e, from, to }: { editor: Editor; from: number; to: number }) =>
        e.isFocused && e.isEditable && from !== to && e.state.selection instanceof TextSelection,
    [],
  );
  return (
    <BubbleMenu
      ref={menu}
      editor={editor}
      className="format-menu"
      role="toolbar"
      aria-label="格式"
      options={options}
      shouldShow={shouldShow}
    >
      {GROUPS.map((group, index) => (
        <div key={index} className="format-menu__group">
          {group.map((button) => (
            <button
              key={button.key}
              type="button"
              className={`format-menu__button format-menu__button--${button.key}`}
              aria-label={button.name}
              title={unavailable[button.key] ?? button.name}
              disabled={button.key in unavailable}
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
