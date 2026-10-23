/**
 * hub 上的自由文件清單：連結、刪除、8 秒的「復原」（票券 21，2026-10-24 使用者裁決）。
 *
 * 刪除不先問「確定嗎？」—— 一份筆記不值得打斷一次；誤刪由「復原」接住。刪除當下就寫進資料庫
 * （persistence 只是標記，排程才真的清掉），所以這 8 秒內關掉分頁，文件就是刪了，跟使用者做的事一致。
 *
 * **滑鼠停在提示上、或鍵盤焦點在提示裡時，倒數暫停**（WCAG 2.2.1）：用鍵盤或螢幕閱讀器的人走到「復原」
 * 需要時間，提示不能在半路消失。用鍵盤按下「刪除」時，那一列連同按鈕一起消失，焦點會掉回 `body` ——
 * 所以這時把焦點直接交給「復原」（倒數也因此暫停，直到他離開）。滑鼠按的不搶焦點：那樣倒數永遠不會開始。
 *
 * 提示用 portal 掛在 `body` 上，不放進清單：它不是清單裡的一項。
 *
 * 寫入是注入的（頁面 bind 好的 server action）—— 這個元件不認識路由層之外的東西，只在結束時 `refresh`
 * 讓伺服器那份清單重新說話。
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { documentLabel } from "@/documents/labels";

/** 「復原」留在畫面上多久。 */
export const UNDO_WINDOW_MS = 8000;

export type FreeDocumentEntry = { documentId: string; title: string | null };

/** 清單、按鈕、提示上顯示的名字：沒命名就是「未命名文件」。 */
const displayTitle = (entry: FreeDocumentEntry) => entry.title ?? documentLabel("自由文件");

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
  const [undoable, setUndoable] = useState<{ entry: FreeDocumentEntry; byKeyboard: boolean } | null>(null);

  const setVisible = (documentId: string, visible: boolean) =>
    setHidden((current) => {
      const next = new Set(current);
      if (visible) next.delete(documentId);
      else next.add(documentId);
      return next;
    });

  const remove = async (entry: FreeDocumentEntry, byKeyboard: boolean) => {
    setVisible(entry.documentId, false);
    if (await deleteDocument(entry.documentId)) {
      setUndoable({ entry, byKeyboard });
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
          <Link href={`/projects/${projectId}/documents/${entry.documentId}`}>{displayTitle(entry)}</Link>
          <button
            type="button"
            className="project-hub__row-action"
            aria-label={`刪除「${displayTitle(entry)}」`}
            // 鍵盤（Enter／空白鍵）觸發的 click 沒有點擊次數：`detail` 是 0。
            onClick={(event) => void remove(entry, event.detail === 0)}
          >
            刪除
          </button>
        </li>
      ))}
      {undoable &&
        createPortal(
          <UndoToast
            key={undoable.entry.documentId}
            label={displayTitle(undoable.entry)}
            takeFocus={undoable.byKeyboard}
            onUndo={() => void undo(undoable.entry)}
            onExpire={() => {
              setUndoable(null);
              router.refresh();
            }}
          />,
          document.body,
        )}
    </>
  );
}

/** 「已刪除「…」 復原」—— 倒數 8 秒，停在上面（滑鼠或焦點）時暫停。 */
function UndoToast({
  label,
  takeFocus,
  onUndo,
  onExpire,
}: {
  label: string;
  takeFocus: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const undoButton = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (takeFocus) undoButton.current?.focus();
  }, [takeFocus]);

  return (
    <div
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
      <button ref={undoButton} type="button" className="project-hub__toast-undo" onClick={onUndo}>
        復原
      </button>
    </div>
  );
}
