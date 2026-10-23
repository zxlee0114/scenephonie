"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveToken } from "@/persistence";
import { createSaveScheduler, type SaveScheduler } from "@/persistence/save-scheduler";

import type { SaveScreenplay } from "./save-capability";

import { toPlainJson } from "./plain-json";

/**
 * 自動存檔 —— 編輯器這一端。
 *
 * 這個 hook 對儲存的認識就是它該有的全部：把 doc 交出去，拿回一個下次要帶上的 token。
 * 備份、並行控制、schema 遷移都在 persistence 模組後面（§6.7）。
 *
 * 存檔函式是**注入**的，不是這裡 import 的 —— 編輯器不認識路由層（§6.3 edge boundary）。
 */
export type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "forbidden" | "error";

export interface Autosave {
  status: SaveStatus;
  /**
   * 立刻把手上的存掉，回報**畫面上的稿是不是都進了資料庫**。匯出 PDF 之前要問這一句（票券 18）：
   * 交付承諾的是 canonical state，存不進去（斷線、衝突、沒有權限）就是 `false`。
   */
  flush: () => Promise<boolean>;
}

export function useAutosave({
  editor,
  screenplayId,
  initialToken,
  save,
}: {
  editor: Editor | null;
  screenplayId: string | undefined;
  initialToken: SaveToken | undefined;
  save: SaveScreenplay | undefined;
}): Autosave {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const schedulerRef = useRef<SaveScheduler | null>(null);
  const tokenRef = useRef<SaveToken | undefined>(initialToken);
  // conflict 之後就停手 —— 我們手上這份的來歷已經不明，再存就是拿舊稿覆蓋新稿。
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!editor || !screenplayId || !save || !tokenRef.current) return;

    const scheduler = createSaveScheduler({
      save: async () => {
        const token = tokenRef.current;
        if (!token || stoppedRef.current) return;
        try {
          // `onLine === false` 只保證「一定斷線」，所以只拿來省掉一定失敗的請求；
          // 照失敗處理，排程器才會維持待存、繼續退避（票券 65）。
          if (!navigator.onLine) throw new Error("offline");
          setStatus("saving");
          const result = await save({
            screenplayId,
            // toPlainJson 不是防禦性複製，是必要的 —— ProseMirror 的 attrs 是 null-prototype
            // 物件，直接交給 Server Action 會被靜默丟掉（見 ./plain-json.ts）。
            doc: toPlainJson(editor.getJSON()) as Record<string, unknown>,
            token,
          });
          // conflict 與 forbidden 都是「再存下去只會更糟」——前者會拿舊稿蓋掉新稿，
          // 後者根本不該有人在這裡寫。兩者都停手，但要分開說：使用者的處置不同。
          if (result.status !== "saved") {
            stoppedRef.current = true;
            setStatus(result.status);
            return;
          }
          tokenRef.current = result.token;
          setStatus("saved");
        } catch (error) {
          // 網路斷了之類。往上拋 —— 排程器要知道這份變更沒落地，才會維持待存並再排一次。
          setStatus("error");
          throw error;
        }
      },
    });

    const onUpdate = (): void => {
      if (stoppedRef.current) return;
      scheduler.changed();
    };
    // 分頁被藏起來／要關掉時把待存的變更趕出去。best-effort：這是縮短那 2.5 秒的暴露窗口，
    // 不是保證 —— 保證由「停頓 ＋ 上限」那條節奏提供。
    const flushPending = (): void => void scheduler.flush();
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") flushPending();
    };

    schedulerRef.current = scheduler;
    editor.on("update", onUpdate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // pagehide 補的是 visibilitychange 沒涵蓋的離開方式（bfcache、部分行動瀏覽器）。
    window.addEventListener("pagehide", flushPending);
    // 網路回來就補存，不等退避排的下一次（最久要等一分鐘）。
    window.addEventListener("online", flushPending);

    return () => {
      editor.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushPending);
      window.removeEventListener("online", flushPending);
      // 這裡只丟計時器不 flush —— 卸載時 editor 可能已經被 Tiptap 拆掉，`getJSON()` 沒有東西可讀。
      // 真正要保住稿的是上面 visibilitychange／pagehide 兩個離開事件。
      scheduler.cancel();
      schedulerRef.current = null;
    };
  }, [editor, screenplayId, save]);

  const flush = useCallback(async () => {
    const scheduler = schedulerRef.current;
    if (!scheduler || stoppedRef.current) return false;
    // conflict／forbidden 不是 reject（排程器以為落地了），所以存完要再看一次是不是停手了。
    return (await scheduler.flush()) && !stoppedRef.current;
  }, []);

  return { status, flush };
}
