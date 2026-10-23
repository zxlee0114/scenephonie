/**
 * hub 上的自由文件清單：連結、刪除、8 秒的「復原」（票券 21，2026-10-24 使用者裁決）。
 *
 * 刪除不先問「確定嗎？」—— 一份筆記不值得打斷一次；誤刪由「復原」接住。刪除當下就寫進資料庫
 * （persistence 只是標記，排程才真的清掉），所以這 8 秒內關掉分頁，文件就是刪了，跟使用者做的事一致。
 *
 * **滑鼠停在提示上、或鍵盤焦點在提示裡時，倒數暫停**（WCAG 2.2.1）：用鍵盤或螢幕閱讀器的人走到「復原」
 * 需要時間，提示不能在半路消失。
 *
 * 寫入是注入的（頁面 bind 好的 server action）—— 這個元件不認識路由層之外的東西，只在結束時 `refresh`
 * 讓伺服器那份清單重新說話。
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { documentLabel } from "@/documents/labels";

/** 「復原」留在畫面上多久。 */
export const UNDO_WINDOW_MS = 8000;

export type FreeDocumentEntry = { documentId: string; title: string | null };

export function FreeDocumentList({
  projectId,
  documents,
  deleteDocument,
  restoreDocument,
}: {
  projectId: string;
  documents: FreeDocumentEntry[];
  deleteDocument: (documentId: string) => Promise<boolean>;
  restoreDocument: (documentId: string) => Promise<boolean>;
}) {
  const router = useRouter();
  // 刪了、伺服器那份清單還沒重新說話之前，先在這裡藏起來。
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [undoable, setUndoable] = useState<FreeDocumentEntry | null>(null);

  const setVisible = (documentId: string, visible: boolean) =>
    setHidden((current) => {
      const next = new Set(current);
      if (visible) next.delete(documentId);
      else next.add(documentId);
      return next;
    });

  const remove = async (entry: FreeDocumentEntry) => {
    setVisible(entry.documentId, false);
    if (await deleteDocument(entry.documentId)) {
      setUndoable(entry);
    } else {
      // 沒刪成（斷線、沒有權限）：放回來，畫面不說它沒做到的事。
      setVisible(entry.documentId, true);
    }
  };

  const undo = async (entry: FreeDocumentEntry) => {
    setUndoable(null);
    if (await restoreDocument(entry.documentId)) setVisible(entry.documentId, true);
    router.refresh();
  };

  const visible = documents.filter((entry) => !hidden.has(entry.documentId));

  return (
    <>
      {visible.map((entry) => (
        <li key={entry.documentId} className="project-hub__row">
          <Link href={`/projects/${projectId}/documents/${entry.documentId}`}>
            {entry.title ?? documentLabel("自由文件")}
          </Link>
          <button
            type="button"
            className="project-hub__row-action"
            aria-label={`刪除「${entry.title ?? documentLabel("自由文件")}」`}
            onClick={() => void remove(entry)}
          >
            刪除
          </button>
        </li>
      ))}
      {undoable && (
        <UndoToast
          key={undoable.documentId}
          label={undoable.title ?? documentLabel("自由文件")}
          onUndo={() => void undo(undoable)}
          onExpire={() => {
            setUndoable(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** 「已刪除「…」 復原」—— 倒數 8 秒，停在上面（滑鼠或焦點）時暫停。 */
function UndoToast({ label, onUndo, onExpire }: { label: string; onUndo: () => void; onExpire: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(UNDO_WINDOW_MS);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => expire.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused]);

  return (
    <li
      className="project-hub__toast"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span>已刪除「{label}」</span>
      <button type="button" className="project-hub__toast-undo" onClick={onUndo}>
        復原
      </button>
    </li>
  );
}
