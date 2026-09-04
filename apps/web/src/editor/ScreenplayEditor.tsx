/**
 * 劇本編輯器 —— 票券 04 的最小可寫作單元。對外就這一個元件。
 */
"use client";

import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useEffect, useReducer, useRef } from "react";

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
  // 內層元件只在零場次時存在 —— 「空狀態剛出現」就是它掛載的那一刻，焦點的接手時機
  // 因此不必自己記上一次是空還是不空。
  return <EmptyScreenplayPanel editor={editor} />;
}

/**
 * 零場次時的鍵盤合約。
 *
 * 這個狀態下 contenteditable 是關的（見 `use-screenplay-editor` 的 `syncEditable`），編輯器
 * 的鍵盤路徑整條不通 —— 所以焦點落在這顆按鈕上，能做的兩件事由這裡自己接：
 *   - Enter／空白：按鈕原生的 click，建一場（焦點串接照舊把游標交給新場次的內外景欄）；
 *   - ⌘+Enter：同一件事，因為畫面上這樣寫著；
 *   - ⌘+Z／⌘+⇧+Z：把整份稿救回來 —— 刪光是可以反悔的，這是票券 32 的核心承諾。
 *
 * 不是把 keymap 複製一份：零場次時**只有**這兩件事做得到，這就是那個狀態的全部合約。
 *
 * 監聽掛在 window 而不是這塊 div 上：焦點是「出現時的禮貌」不是「有效的前提」—— 使用者點一下
 * 空白處焦點就掉到 body，那時 ⌘+Z 與 ⌘+Enter 都收不到，整個畫面又變回死路（使用者回饋
 * 2026-09-04 第三輪）。零場次時全頁本來就沒有別的東西會用到這兩組鍵。
 */
function EmptyScreenplayPanel({ editor }: { editor: Editor }) {
  const action = useRef<HTMLButtonElement>(null);

  // 空狀態出現的那一刻，原本承載焦點的內容（或整個 contenteditable）已經不在了。
  // 焦點不接手就會掉到 body —— 鍵盤使用者要能直接按 Enter／空白。
  useEffect(() => {
    action.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "Enter") {
        // 焦點在按鈕上時這一下同時也是按鈕的原生 click —— preventDefault 擋掉，
        // 否則同一次按鍵會建出兩場。
        event.preventDefault();
        requestNextScene(editor, null);
        return;
      }
      if (event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) editor.commands.redo();
      else editor.commands.undo();
      // 還原不出東西時 doc 仍是空的，contenteditable 還關著，focus 也無處可去。
      if (editor.state.doc.childCount === 0) return;
      // 刪光那一步的選取是 `AllSelection`，undo 會連選取一起還原 —— 整份稿於是頂著反白回來，
      // 要點進內文才消失（使用者回饋 2026-09-04 第三輪，與新場次浮現動畫的底色同一個病灶）。
      // 收成游標放在文件末端，對齊「載入既有劇本」的落點慣例（`documentEnd`，票券 26）。
      editor.commands.setTextSelection(editor.state.doc.content.size);
      // 救回來了就把焦點還給編輯器 —— 這顆按鈕連同空狀態會在這次 render 之後消失。
      editor.view.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editor]);

  return (
    <div className="empty-screenplay">
      {/* 刪掉最後一場時這句話是憑空出現的 —— 比照 .save-status 出個聲，
          否則螢幕閱讀器的使用者只會遇到一片安靜。 */}
      <p className="empty-screenplay__line" role="status" aria-live="polite">
        這份劇本現在是張白紙。
      </p>
      {/* 出口寫成一句話，按鈕就長在句子裡。⌘+Enter 的提示常駐 —— 空狀態時它是鍵盤
          使用者唯一看得見的線索。
          按鈕寫「新增場次」不是腳部那顆的「新增下一場」：沒有任何一場在，就沒有「下一場」。 */}
      <p className="empty-screenplay__how">
        點擊{" "}
        <button
          ref={action}
          type="button"
          className="empty-screenplay__action"
          // 焦點該留給新場次的內外景欄（§7.1 焦點串接），別在點擊當下先被按鈕搶走。
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => requestNextScene(editor, null)}
        >
          ＋ 新增場次
        </button>{" "}
        或使用快捷鍵 <span className="empty-screenplay__key">⌘ + Enter</span> 開始寫作
      </p>
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
