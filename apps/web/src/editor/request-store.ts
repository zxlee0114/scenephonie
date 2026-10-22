/**
 * 「plugin 要問一件事、React 畫出那個問題」的單格 store（票券 13）。
 *
 * ProseMirror plugin 沒有自己的 React 樹：它把請求放進來，掛在編輯器旁邊的元件
 * （`PointMenu`、`MergeConfirm`）訂閱、畫出來，回答後清掉。同一時間只有一個請求。
 */
"use client";

import { useSyncExternalStore } from "react";

export function requestStore<T>() {
  let current: T | null = null;
  const listeners = new Set<() => void>();
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  return {
    set(next: T | null) {
      current = next;
      listeners.forEach((l) => l());
    },
    get: () => current,
    use: () => useSyncExternalStore(subscribe, () => current, () => null),
  };
}
