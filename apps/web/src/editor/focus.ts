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

/**
 * 交接焦點 —— 並且讓交接**看得見**。
 *
 * `:focus-visible` 是瀏覽器依「最近一次互動模態」給的，程式化 focus 只有在**上一個焦點元素
 * 自己就是 focus-visible** 時才傳得過去。所以：焦點還在「＋ 新增場次」上時建場，環會跟著移到
 * 新場次的內外景欄；但使用者先用滑鼠點過空白處（`document.activeElement` 是 `<body>`）再建場，
 * chip 明明拿到了焦點卻沒有環 —— 看起來就是「新場次沒有初始焦點」（使用者回饋 2026-09-04）。
 * 鍵盤建的那一下也一樣，因為傳遞看的是上一個焦點元素而不是這一下按了什麼。
 *
 * 焦點串接是程式**主動**把游標交出去的（§7.1），不是使用者自己點的 —— 那就有義務畫出來
 * 「你現在在這裡」。所以自己掛一個 class，失焦時卸掉（之後使用者自己點的那些，照舊交給
 * `:focus-visible` 判斷）。
 */
export function handOffFocus(el: HTMLElement | null, options?: FocusOptions): void {
  if (!el) return;
  el.focus(options);
  if (el.ownerDocument.activeElement !== el) return;
  el.classList.add("is-focus-handed");
  el.addEventListener("blur", () => el.classList.remove("is-focus-handed"), { once: true });
}

/** 訂閱「掛載之後才發出」的 focus 請求；回傳退訂函式。 */
export function subscribeFocusRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
