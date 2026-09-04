/**
 * 劇本編輯器 —— 票券 04 的最小可寫作單元。對外就這一個元件。
 */
"use client";

import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useEffect, useReducer } from "react";

import type { SaveScreenplay, SaveToken } from "@/persistence";

import "../styles/editor.css";
import { requestNextScene } from "./extensions/next-scene";
import { SlashMenu } from "./extensions/slash";
import { useAutosave, type SaveStatus } from "./use-autosave";
import { useScreenplayEditor, type InitialFocus } from "./use-screenplay-editor";

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

/**
 * 零場次時的出口（票券 32）。
 *
 * doc 是 `scene*`，一場不剩是**合法**的文件狀態（⌘+A 全選到整份再刪除，或載入一份空稿）——
 * 壞掉的是畫面不是模型：「＋ 新增下一場」住在場次腳部，場次沒了它也沒了，contenteditable
 * 高度歸零，沒有可點的區域也沒有一個字說明還能做什麼。焦點還在編輯器裡時 ⌘+Enter 仍有效，
 * 但點掉焦點或重整回來就是死路。
 *
 * **不自動補一場。** 自動補會讓「刪掉全部」變成兩步歷史（⌘+Z 救不回一次），並且對文件說謊 ——
 * 持久化、場次表與匯出前防呆看到的都該是真的零場。「劇本至少有一場」是初始化的責任
 * （見 `empty-screenplay.ts`），不是一個在使用者背後持續修補文件的東西。
 *
 * 場次數走 render 期直接讀 `doc.childCount`＋訂閱 `update` 重繪，不另存一份 state ——
 * 存 state 的話首次 render 一定是 0，非空的稿子會閃一下空狀態。
 */
export function EmptyScreenplayState({ editor }: { editor: Editor | null }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("update", rerender);
    return () => {
      editor.off("update", rerender);
    };
  }, [editor]);

  // editor 還沒建好（`immediatelyRender: false`）時什麼都不說 —— 那不是「零場次」。
  if (!editor || editor.state.doc.childCount > 0) return null;

  return (
    <div className="empty-screenplay">
      {/* 刪掉最後一場時這句話是憑空出現的 —— 比照 .save-status 出個聲，
          否則螢幕閱讀器的使用者只會遇到一片安靜。 */}
      <p className="empty-screenplay__line" role="status" aria-live="polite">
        這份劇本還沒有場次。
      </p>
      <button
        type="button"
        className="empty-screenplay__action"
        // 焦點該留給新場次的內外景欄（§7.1 焦點串接），別先被按鈕搶走；點擊本身走 onClick，
        // 鍵盤（Enter／Space）那條才進得來 —— 這顆是空狀態下唯一可操作的東西。
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => requestNextScene(editor, null)}
      >
        ＋ 新增下一場
      </button>
      {/* ⌘+Enter 的提示常駐：空狀態時它是鍵盤使用者唯一看得見的線索。 */}
      <p className="empty-screenplay__hint">或按 ⌘+Enter</p>
    </div>
  );
}

export function ScreenplayEditor({
  initialContent,
  initialFocus,
  screenplayId,
  initialToken,
  save,
}: {
  initialContent?: object;
  initialFocus?: InitialFocus;
  screenplayId?: string;
  initialToken?: SaveToken;
  save?: SaveScreenplay;
}) {
  const editor = useScreenplayEditor(initialContent, initialFocus);
  const status = useAutosave({ editor, screenplayId, initialToken, save });

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
      <EmptyScreenplayState editor={editor} />
      <SlashMenu />
    </div>
  );
}
