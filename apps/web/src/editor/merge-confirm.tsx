/**
 * 「這一下會併掉場次」的確認窗（票券 13，使用者決定 2026-10-22）。
 *
 * 跨場次的選取，⌫／Delete／打字／貼上／剪下／Enter 都改走「各場各自刪」（`./extensions/scoped-delete`），
 * 不會併場。剩下的路 —— 注音組字蓋過選取、把選取的文字拖走 —— 照 ProseMirror 原生的 replace 走，
 * 會把相鄰的場次接成一場、被併掉的那場連同場次資訊一起不見。**可以做，但先問**：那一筆先攔下來，
 * 編劇按「仍要合併」才照原樣送出；按取消或 Esc 就當沒發生。
 *
 * 勾「不再提醒」之後在這台瀏覽器上不再問（localStorage：一個人的習慣，不是劇本的狀態，同
 * `use-scene-nav-open`）。讀寫丟例外（隱私模式）就當沒勾 —— 寧可多問一次。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { requestStore } from "./request-store";

const SKIP_KEY = "scenephonie:merge-confirm:skip";

export function mergeConfirmSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function skipMergeConfirm(): void {
  try {
    localStorage.setItem(SKIP_KEY, "1");
  } catch {
    // 存不下就下次再問。
  }
}

export interface MergeRequest {
  /** 會被併掉幾場（子場次也算）。 */
  readonly count: number;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

export const mergeRequests = requestStore<MergeRequest>();

export function MergeConfirm() {
  const request = mergeRequests.use();
  return request ? <Dialog request={request} /> : null;
}

function Dialog({ request }: { request: MergeRequest }) {
  const [remember, setRemember] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  // 預設焦點在「取消」：打開它的可能是一串還沒打完的注音，連按 Enter 不該等於同意併場。
  useEffect(() => cancelButton.current?.focus(), []);

  const confirm = () => {
    if (remember) skipMergeConfirm();
    request.confirm();
  };

  return (
    <div className="merge-confirm__scrim" onMouseDown={request.cancel}>
      <div
        className="merge-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="merge-confirm-title"
        aria-describedby="merge-confirm-body"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") request.cancel();
        }}
      >
        <h2 id="merge-confirm-title" className="merge-confirm__title">
          這一下會合併場次
        </h2>
        <p id="merge-confirm-body" className="merge-confirm__body">
          選取跨過了場次的邊界：有 {request.count} 場會被併進相鄰的場次，它的場次資訊（地點、登場人物…）
          會一起不見。想保留每一場，改按 ⌫ 刪掉選取再打字。
        </p>
        <label className="merge-confirm__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          不再提醒
        </label>
        <div className="merge-confirm__actions">
          <button ref={cancelButton} type="button" onClick={request.cancel}>
            取消
          </button>
          <button type="button" className="merge-confirm__go" onClick={confirm}>
            仍要合併
          </button>
        </div>
      </div>
    </div>
  );
}
