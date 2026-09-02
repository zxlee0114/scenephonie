/**
 * 建立節點之後，把游標送進「下一個該打字的地方」——心流的一部分（§7.1 焦點串接）。
 *
 * `/next` 建完場次，手不該離開鍵盤去點地點欄；Tab 轉成對白，游標該直接落在人物欄。
 * canonical doc 由 command 整份 replace，位置會變，所以用「場次 id ＋ 區塊序」定位而非
 * 絕對位置。node view 掛載時 `claim`，輪到自己就消費掉請求。
 */
export type PendingFocus =
  | { readonly kind: "sceneMeta"; readonly sceneId: string }
  | { readonly kind: "speaker"; readonly sceneId: string; readonly blockIndex: number };

let pending: PendingFocus | null = null;

export function requestFocus(next: PendingFocus): void {
  pending = next;
}

/** node view 掛載時呼叫。輪到自己就回 `true` 並清掉請求。 */
export function claimFocus(match: (p: PendingFocus) => boolean): boolean {
  if (pending && match(pending)) {
    pending = null;
    return true;
  }
  return false;
}
