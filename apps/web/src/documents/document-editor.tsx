/**
 * 劇本外文件的編輯器（票券 21）：故事大綱（交件大綱）、分場大綱、自由文件 —— 三份都是散文。
 *
 * 跟劇本編輯器共用的只有存檔那一條（`useAutosave`／`SaveStatusLine`）：場次、chip、slash 選單在這裡
 * 都沒有容身處。節點對齊 `@scenephonie/schema` 那個 kind 的 schema —— 寫入邊界照它驗證，這裡長不出
 * 它讀不懂的東西。
 *
 * **字數計數器只計數、不執行規則**（§9.7）：沒有上限、沒有變色、沒有警告。上限是各案特例，
 * 編劇自己對照簡章 —— 我們替他讀簡章，讀錯的代價是件被退。
 *
 * 存檔與改名都是注入的 —— 這個元件不認識路由層（§6.3）。
 */
"use client";

import { textblockTypeInputRule, type Editor } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState } from "react";

import { wordCount, type DocumentKind } from "@scenephonie/schema";

import { FormatMenu } from "@/documents/format-menu";
import { documentLabel } from "@/documents/labels";
import { SaveStatusLine } from "@/editor/save-status";
import type { SaveDoc } from "@/editor/save-capability";
import { toPlainJson } from "@/editor/plain-json";
import { useAutosave } from "@/editor/use-autosave";
import type { PersistedDoc, SaveToken } from "@/persistence";

import "../styles/documents.css";

/**
 * 簡單的富文本：第二、三層標題、項目與編號清單、引用、分隔線、粗體、斜體（2026-10-24 使用者裁決）。
 * 每一樣都有 Markdown 捷徑（`## `、`- `、`1. `、`> `、`---`、`**粗**`、`*斜*`），那是 StarterKit 內建的 input rule。
 *
 * 第一層標題留給文件名稱。其餘全關：底線、刪除線、連結、程式碼不在清單上；`hardBreak` 也關 ——
 * 一段就是一段，換段按 Enter。標題換成下面那個 `ProseHeading`。
 */
const PROSE_KIT = StarterKit.configure({
  heading: false,
  hardBreak: false,
  codeBlock: false,
  strike: false,
  code: false,
  link: false,
  underline: false,
  dropcursor: false,
  trailingNode: false,
});

/**
 * 第二、三層標題，捷徑**只在一般段落裡**生效。原生的 Heading 在標題裡也吃 `## `：標題打字打到
 * 「## 」開頭，那幾個字就被吃掉、只是又變成一次標題（票券 21 驗收）。捷徑剛轉換完時按一次 Backspace
 * 會退回原本打的字（Tiptap 內建），但那要先知道。
 */
const ProseHeading = Heading.extend({
  addInputRules() {
    return this.options.levels.map((level) => {
      const rule = textblockTypeInputRule({
        find: new RegExp(`^(#{${Math.min(...this.options.levels)},${level}})\\s$`),
        type: this.type,
        getAttributes: { level },
      });
      const convert = rule.handler;
      rule.handler = (props) =>
        props.state.doc.resolve(props.range.from).parent.type.name === "paragraph" ? convert(props) : null;
      return rule;
    });
  },
}).configure({ levels: [2, 3] });

/** 空白文件裡淡淡的一行：告訴人「從這裡開始寫」，編輯區在哪裡也就一目了然。 */
const EMPTY_HINT = Placeholder.configure({ placeholder: "從這裡開始寫…" });

/**
 * 一份文件的內文怎麼落地：
 *
 * - **存進資料庫**（文件頁）：自動存檔、狀態列、標題列。
 * - **交給呼叫端**（建立精靈的頁籤，票券 71）：專案還不存在，每次改動把 doc 交出去寫進本機草稿。
 *   沒有標題列（頁籤上就是它的名字）、**沒有存檔狀態** —— 「已儲存」在這裡是假話，什麼都還沒到伺服器。
 */
type Persistence =
  | {
      initialToken: SaveToken;
      save: SaveDoc;
      /** 可命名的文件（自由文件）才有。`focus`：剛新增的那一份，一進來就先取名字。 */
      title?: { initial: string | null; rename: (title: string) => Promise<boolean>; focus?: boolean };
    }
  | { onDraftChange: (body: PersistedDoc) => void };

export function DocumentEditor({
  kind,
  initialBody,
  ...persistence
}: { kind: DocumentKind; initialBody: object } & Persistence) {
  const label = documentLabel(kind);
  const saved = "save" in persistence ? persistence : undefined;
  const onDraftChange = "onDraftChange" in persistence ? persistence.onDraftChange : undefined;
  const editor = useEditor({
    // Next SSR：先不 render，等 client 掛載，避開 hydration mismatch。
    immediatelyRender: false,
    extensions: [PROSE_KIT, ProseHeading, EMPTY_HINT],
    content: initialBody,
    editorProps: { attributes: { class: "document-page__body", "aria-label": label } },
    // 精靈的頁籤沒有標題列可以先點：一進來（或換頁籤）游標就在內文末尾，直接寫。
    autofocus: onDraftChange ? "end" : false,
    // ProseMirror 的 attrs 是 null-prototype 物件 —— 草稿之後要過 Server Action，先正規化（見 plain-json）。
    onUpdate: ({ editor }) => onDraftChange?.(toPlainJson(editor.getJSON()) as PersistedDoc),
  });
  const autosave = useAutosave({ editor, initialToken: saved?.initialToken, save: saved?.save });
  const count = useWordCount(editor);
  const title = saved?.title;

  // 字數釘在畫面右下角，跟著文件走、不跟標題並排 —— 並排會讓人以為它在數標題（票券 21 驗收）。
  return (
    <div className="document-page">
      {saved && (
        <div className="document-page__head">
          {title ? (
            <TitleField placeholder={label} {...title} onEnter={() => editor?.commands.focus("start")} />
          ) : (
            <h1 className="document-page__title">{label}</h1>
          )}
          <SaveStatusLine {...autosave} noun={title ? "文件" : label} />
        </div>
      )}
      {editor && <FormatMenu editor={editor} />}
      <EditorContent editor={editor} />
      {count !== null && (
        <p className="document-page__count" aria-live="off">
          {count.toLocaleString("en-US")} 字
        </p>
      )}
    </div>
  );
}

/** 這份 doc 現在幾個字，每次改動後重算；editor 還沒掛上就是 `null`。 */
function useWordCount(editor: Editor | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!editor) return;
    const recount = () => setCount(wordCount(editor.state.doc));
    recount();
    editor.on("update", recount);
    return () => {
      editor.off("update", recount);
    };
  }, [editor]);
  return editor ? count : null;
}

/** 文件名稱。離開欄位或按 Enter 才定案；沒變就不送。 */
function TitleField({
  placeholder,
  initial,
  rename,
  focus = false,
  onEnter,
}: {
  placeholder: string;
  initial: string | null;
  rename: (title: string) => Promise<boolean>;
  focus?: boolean;
  /** 按 Enter 定案之後：接著寫內文。 */
  onEnter: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [committed, setCommitted] = useState(initial ?? "");

  const commit = () => {
    const next = value.trim();
    if (next === committed) return;
    setCommitted(next);
    setValue(next);
    void rename(next).then((ok) => {
      // 沒改成（斷線、沒有權限）：退回上一個名字，畫面不說它沒做到的事。
      if (!ok) {
        setCommitted(committed);
        setValue(committed);
      }
    });
  };

  return (
    <input
      className="document-page__title document-page__title-input"
      aria-label="文件名稱"
      placeholder={placeholder}
      // 剛按「＋ 新增文件」進來：先取名字，Enter 之後再寫內文。
      autoFocus={focus}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        commit();
        onEnter();
      }}
    />
  );
}
