/**
 * 建立節點之後，把游標送進「下一個該打字的地方」——心流的一部分（§7.1 焦點串接）。
 *
 * `/next` 建完場次，手不該離開鍵盤去點地點欄；Tab 轉成對白，游標該直接落在人物欄。
 * canonical doc 由 command 整份 replace，位置會變，所以用「場次 id ＋ 區塊序」定位而非
 * 絕對位置。node view 掛載時 `claim`，輪到自己就消費掉請求。
 *
 * 多數情境請求早於掛載（command 先跑、新 node view 後掛）。但初次進編輯器例外：`onCreate`
 * 發出的請求晚於首批 node view 的 effect（React effect 由子到父）。故除了掛載時 claim 一次，
 * node view 也 `subscribe` 後續請求。
 */
import type { BlockAddress } from "./address";

export type PendingFocus =
  | { readonly kind: "sceneMeta"; readonly sceneId: string }
  | ({ readonly kind: "speaker" } & BlockAddress);

let pending: PendingFocus | null = null;
const listeners = new Set<() => void>();

export function requestFocus(next: PendingFocus): void {
  pending = next;
  listeners.forEach((notify) => notify());
}

/** node view 掛載時（及被通知時）呼叫。輪到自己就回 `true` 並清掉請求。 */
export function claimFocus(match: (p: PendingFocus) => boolean): boolean {
  if (pending && match(pending)) {
    pending = null;
    return true;
  }
  return false;
}

/** 訂閱「掛載之後才發出」的 focus 請求；回傳退訂函式。 */
export function subscribeFocusRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
