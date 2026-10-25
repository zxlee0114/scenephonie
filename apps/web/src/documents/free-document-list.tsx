/**
 * hub 上的自由文件清單：連結、刪除、8 秒的「復原」（票券 21，2026-10-24 使用者裁決）。
 *
 * 刪除不先問「確定嗎？」—— 一份筆記不值得打斷一次；誤刪由「復原」接住。刪除當下就寫進資料庫
 * （persistence 只是標記，排程才真的清掉），所以這 8 秒內關掉分頁，文件就是刪了，跟使用者做的事一致。
 *
 * 「復原」提示是共用的 `UndoToast`（倒數、暫停、焦點的規則寫在那裡）。用鍵盤按下「刪除」時，那一列連同
 * 按鈕一起消失，焦點會掉回 `body` —— 所以這時把焦點直接交給「復原」。滑鼠按的不搶焦點。
 *
 * 提示用 portal 掛在 `body` 上，不放進清單：它不是清單裡的一項。
 *
 * 寫入是注入的（頁面 bind 好的 server action）—— 這個元件不認識路由層之外的東西，只在結束時 `refresh`
 * 讓伺服器那份清單重新說話。
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

import { DocumentCard } from "@/documents/document-card";
import { documentLabel } from "@/documents/labels";
import { UndoToast } from "@/ui/undo-toast";

export type FreeDocumentEntry = {
  documentId: string;
  title: string | null;
  /** 卡片上那一行淡字（伺服器那邊照台北時間排好）。 */
  meta: string;
  /** 內文開頭幾個字。 */
  excerpt: string;
};

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
        <DocumentCard
          key={entry.documentId}
          href={`/projects/${projectId}/documents/${entry.documentId}`}
          name={displayTitle(entry)}
          meta={entry.meta}
          excerpt={entry.excerpt}
          action={
            <button
              type="button"
              className="hub-card__action"
              aria-label={`刪除「${displayTitle(entry)}」`}
              // 鍵盤（Enter／空白鍵）觸發的 click 沒有點擊次數：`detail` 是 0。
              onClick={(event) => void remove(entry, event.detail === 0)}
            >
              刪除
            </button>
          }
        />
      ))}
      {undoable &&
        createPortal(
          <UndoToast
            key={undoable.entry.documentId}
            message={`已刪除「${displayTitle(undoable.entry)}」`}
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
