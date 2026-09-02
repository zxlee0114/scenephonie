/**
 * 「剛被新增出來的場次」的一次性登記簿 —— 給「新增下一場」的即時視覺回饋用
 * （使用者回饋 2026-09-03；§7.10 的「明確 append」）。
 *
 * command bridge 建完新場次後 `markSceneBorn(id)`；新的 SceneView 掛載時 `consumeSceneBirth(id)`，
 * 領到就短暫掛上 `.scene--just-added`（CSS animation 自己淡出）。與 `./focus` 的 pending-focus
 * 同一種「建立當下的一次性動作」模型，各自獨立。
 */
const births = new Map<string, number>();

/** 新場次建立後呼叫。 */
export function markSceneBorn(sceneId: string): void {
  births.set(sceneId, Date.now());
}

/** SceneView 掛載時呼叫：這一場是不是剛（2 秒內）被新增出來的？領到就清掉，只回一次 true。 */
export function consumeSceneBirth(sceneId: string): boolean {
  const at = births.get(sceneId);
  if (at == null) return false;
  births.delete(sceneId);
  return Date.now() - at < 2000;
}
