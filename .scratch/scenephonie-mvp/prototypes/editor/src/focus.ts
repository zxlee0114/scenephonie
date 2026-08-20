// 建立節點之後，把游標送進「下一個該打字的地方」。
//
// 這是心流的一部分：/scene 建完場次，手不該離開鍵盤去點地點欄；
// Tab 轉成對白，游標該直接在人物欄裡。

type Pending =
  | { kind: 'sceneMeta'; sceneId: string }
  | { kind: 'character'; pos: number }

let pending: Pending | null = null

export function requestFocus(p: Pending) {
  pending = p
}

/** node view 掛載時呼叫。輪到自己就回 true 並清掉請求。 */
export function claimFocus(match: (p: Pending) => boolean): boolean {
  if (pending && match(pending)) {
    pending = null
    return true
  }
  return false
}
