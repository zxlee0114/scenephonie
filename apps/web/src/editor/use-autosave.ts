"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import { saveScreenplayAction } from "@/app/editor/actions";
import type { SaveToken } from "@/persistence";
import { createSaveScheduler } from "@/persistence/save-scheduler";

/**
 * 自動存檔 —— 編輯器這一端。
 *
 * 這個 hook 對儲存的認識就是它該有的全部：把 doc 交出去，拿回一個下次要帶上的 token。
 * 備份、並行控制、schema 遷移都在 persistence 模組後面（§6.7）。
 */
export type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";

export function useAutosave({
  editor,
  screenplayId,
  initialToken,
}: {
  editor: Editor | null;
  screenplayId: string | undefined;
  initialToken: SaveToken | undefined;
}): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const tokenRef = useRef<SaveToken | undefined>(initialToken);
  // conflict 之後就停手 —— 我們手上這份的來歷已經不明，再存就是拿舊稿覆蓋新稿。
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!editor || !screenplayId || !tokenRef.current) return;

    const scheduler = createSaveScheduler({
      save: async () => {
        const token = tokenRef.current;
        if (!token || stoppedRef.current) return;
        setStatus("saving");
        try {
          const result = await saveScreenplayAction({
            screenplayId,
            doc: editor.getJSON() as Record<string, unknown>,
            token,
          });
          if (result.status === "conflict") {
            stoppedRef.current = true;
            setStatus("conflict");
            return;
          }
          tokenRef.current = result.token;
          setStatus("saved");
        } catch {
          // 網路斷了之類 —— doc 還是 dirty，下一次變更會再排一次。
          setStatus("error");
        }
      },
    });

    const onUpdate = (): void => {
      if (stoppedRef.current) return;
      scheduler.changed();
    };
    // 分頁被藏起來／要關掉時把待存的變更趕出去。best-effort：這是縮短暴露窗口，
    // 不是保證 —— 保證由「停頓 ＋ 上限」那條節奏提供。
    const onHide = (): void => {
      if (document.visibilityState === "hidden") void scheduler.flush();
    };

    editor.on("update", onUpdate);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      editor.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onHide);
      scheduler.cancel();
    };
  }, [editor, screenplayId]);

  return status;
}
