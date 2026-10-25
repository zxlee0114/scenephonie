/**
 * 「已刪除「…」 復原」—— 剛做完一件可以撤回的事之後，浮在畫面底部的那一則提示（票券 21 起；票券 72 起
 * 專案的封存與刪除也用它）。倒數 8 秒自己收掉。
 *
 * **滑鼠停在提示上、或鍵盤焦點在提示裡時，倒數暫停**（WCAG 2.2.1）：用鍵盤或螢幕閱讀器的人走到「復原」
 * 需要時間，提示不能在半路消失。`takeFocus` 給「用鍵盤觸發、觸發它的按鈕跟著消失」的呼叫端 —— 焦點直接
 * 交給「復原」（倒數也因此暫停，直到他離開）。滑鼠按的不搶焦點：那樣倒數永遠不會開始。
 *
 * 字由呼叫端給（「已刪除「…」」「已封存「…」」）；按鈕永遠是「復原」—— 撤回剛才那一下。
 */
"use client";

import { useEffect, useRef, useState } from "react";

/** 「復原」留在畫面上多久。 */
export const UNDO_WINDOW_MS = 8000;

export function UndoToast({
  message,
  takeFocus,
  onUndo,
  onExpire,
}: {
  message: string;
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
      <span>{message}</span>
      <button ref={undoButton} type="button" className="project-hub__toast-undo" onClick={onUndo}>
        復原
      </button>
    </div>
  );
}
