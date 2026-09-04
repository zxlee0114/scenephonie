/**
 * 劇本編輯器 —— 票券 04 的最小可寫作單元。對外就這一個元件。
 */
"use client";

import { EditorContent } from "@tiptap/react";

import type { SaveToken } from "@/persistence";

import "../styles/editor.css";
import { SlashMenu } from "./extensions/slash";
import { useAutosave, type SaveStatus } from "./use-autosave";
import { useScreenplayEditor } from "./use-screenplay-editor";

/**
 * 存檔狀態的文案。
 *
 * 「已儲存」不常駐 —— 平時什麼都不說是對的：自動存檔是承諾不是功能。只有正在存、
 * 或出了編劇需要知道的事時才出聲。
 */
const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "",
  saving: "儲存中…",
  saved: "已儲存",
  error: "存檔失敗，會再試一次",
  conflict: "這份劇本在別的地方被改過了，請重新整理再繼續",
};

export function ScreenplayEditor({
  initialContent,
  screenplayId,
  initialToken,
}: {
  initialContent?: object;
  screenplayId?: string;
  initialToken?: SaveToken;
}) {
  const editor = useScreenplayEditor(initialContent);
  const status = useAutosave({ editor, screenplayId, initialToken });

  return (
    <div className="screenplay-page">
      <p
        className={`save-status${status === "conflict" || status === "error" ? " save-status--loud" : ""}`}
        role="status"
        aria-live="polite"
      >
        {STATUS_TEXT[status]}
      </p>
      <EditorContent editor={editor} />
      <SlashMenu />
    </div>
  );
}
