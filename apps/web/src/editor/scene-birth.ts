/**
 * 「剛被新增出來的場次」的一次性登記簿 —— 給「新增下一場」的即時視覺回饋用
 * （使用者回饋 2026-09-03；§7.10 的「明確 append」）。
 *
 * command bridge 建完新場次後 `markSceneBorn(id)`。SceneView 有兩條領取路徑：
 *  - **掛載時** `consumeSceneBirth(id)` —— append 到結尾時，新的 node view 一定重新掛載，
 *    此時 `markSceneBorn` 已先跑過。
 *  - **訂閱** `subscribeSceneBirth` —— 在中間插入時，command bridge 是整份 doc replace，
 *    ProseMirror 可能沿用既有 node view（只 `updateProps`、不重新掛載），這條就領不到。
 *    改讓 `markSceneBorn` 主動通知所有掛載中的 SceneView，被沿用的那個也收得到。
 *
 * 與 `./focus` 的 pending-focus 同一種「建立當下的一次性動作」模型，各自獨立。
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let born: { sceneId: string; at: number } | null = null;

/** 新場次建立後呼叫 —— 記下來，並通知掛載中的 SceneView 去領。 */
export function markSceneBorn(sceneId: string): void {
  born = { sceneId, at: Date.now() };
  listeners.forEach((fn) => fn());
}

/** 訂閱「有新場次誕生」的通知。回傳退訂函式。 */
export function subscribeSceneBirth(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 丟掉還沒被領走的誕生登記 —— 與 `./focus` 的 `claimFocus(() => true)` 同一個理由：
 * `born` 活在 module 層，會跨 editor instance 活下來。`/next` 建完場次、SceneView 還沒掛載
 * 使用者就離開，回到 /editor 時同一個 sceneId 掛上來會領到那筆過期的誕生，於是「載入」被當成
 * 「剛新增」—— 重播浮現動畫，還會捲一次打字餘裕（票券 27）。
 */
export function resetSceneBirth(): void {
  born = null;
}

/** 這個 sceneId 是不是剛（1.5 秒內）被新增出來的？領到就清掉，只回一次 true。 */
export function consumeSceneBirth(sceneId: string): boolean {
  if (born == null || born.sceneId !== sceneId) return false;
  const fresh = Date.now() - born.at < 1500;
  born = null;
  return fresh;
}
