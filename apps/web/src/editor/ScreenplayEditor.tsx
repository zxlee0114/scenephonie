/**
 * 劇本編輯器 —— 票券 04 的最小可寫作單元。對外就這一個元件。
 */
"use client";

import { EditorContent } from "@tiptap/react";

import "../styles/editor.css";
import { SlashMenu } from "./extensions/slash";
import { useScreenplayEditor } from "./use-screenplay-editor";

export function ScreenplayEditor({ initialContent }: { initialContent?: object }) {
  const editor = useScreenplayEditor(initialContent);

  return (
    <div className="screenplay-page">
      <EditorContent editor={editor} />
      <SlashMenu />
    </div>
  );
}
