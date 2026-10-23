/**
 * 交件文件的編輯器（票券 21）：交件大綱、分場大綱 —— 兩份都是散文。
 *
 * 跟劇本編輯器共用的只有存檔那一條（`useAutosave`／`SaveStatusLine`）：場次、chip、slash 選單在這裡
 * 都沒有容身處。節點只有段落與字，對齊 `@scenephonie/schema` 那個 kind 的 schema（`block+`／`text*`）——
 * 寫入邊界照它驗證，這裡長不出它讀不懂的東西。
 *
 * **字數計數器只計數、不執行規則**（§9.7）：沒有上限、沒有變色、沒有警告。上限是各案特例，
 * 編劇自己對照簡章 —— 我們替他讀簡章，讀錯的代價是件被退。分場大綱沒有計數器：沒有人在管它的字數。
 *
 * 存檔與改名都是注入的 —— 這個元件不認識路由層（§6.3）。
 */
"use client";

import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState } from "react";

import { countCharacters, type DocumentKind } from "@scenephonie/schema";

import { SaveStatusLine } from "@/editor/save-status";
import type { SaveDoc } from "@/editor/save-capability";
import { useAutosave } from "@/editor/use-autosave";
import type { SaveToken } from "@/persistence";

import "../styles/documents.css";

/** 哪幾個 kind 有字數計數器。 */
const COUNTED: ReadonlySet<DocumentKind> = new Set(["交件大綱"]);

/**
 * 只留段落、字與 undo。其餘全關 —— 約束 2（不含呈現性資訊），而且兩份文件都沒有規定格式。
 * `hardBreak` 也關：一段就是一段，換段按 Enter。
 */
const PROSE_KIT = StarterKit.configure({
  heading: false,
  hardBreak: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  listKeymap: false,
  codeBlock: false,
  horizontalRule: false,
  bold: false,
  italic: false,
  strike: false,
  code: false,
  link: false,
  underline: false,
  dropcursor: false,
  gapcursor: false,
  trailingNode: false,
});

export function DocumentEditor({
  kind,
  initialBody,
  initialToken,
  save,
  title,
}: {
  kind: DocumentKind;
  initialBody: object;
  initialToken: SaveToken;
  save: SaveDoc;
  /** 可命名的文件（交件大綱）才有。 */
  title?: { initial: string | null; rename: (title: string) => Promise<boolean> };
}) {
  const editor = useEditor({
    // Next SSR：先不 render，等 client 掛載，避開 hydration mismatch。
    immediatelyRender: false,
    extensions: [PROSE_KIT],
    content: initialBody,
    editorProps: { attributes: { class: "document-page__body", "aria-label": kind } },
  });
  const autosave = useAutosave({ editor, initialToken, save });
  const count = useCharacterCount(COUNTED.has(kind) ? editor : null);

  return (
    <div className="document-page">
      <div className="document-page__head">
        {title ? <TitleField kind={kind} {...title} /> : <h1 className="document-page__title">{kind}</h1>}
        {count !== null && (
          <p className="document-page__count">{count.toLocaleString("en-US")} 字</p>
        )}
      </div>
      <SaveStatusLine {...autosave} noun={kind} />
      <EditorContent editor={editor} />
    </div>
  );
}

/** 這份 doc 現在幾個字，每次改動後重算；沒有 editor（或這個 kind 不計數）就是 `null`。 */
function useCharacterCount(editor: Editor | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!editor) return;
    const recount = () => setCount(countCharacters(editor.state.doc));
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
  kind,
  initial,
  rename,
}: {
  kind: DocumentKind;
  initial: string | null;
  rename: (title: string) => Promise<boolean>;
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
      placeholder={kind}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        commit();
      }}
    />
  );
}
