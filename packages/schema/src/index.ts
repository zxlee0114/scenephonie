/**
 * `@scenephonie/schema` —— isomorphic 場次 schema 與推導函式。
 *
 * 邊界規則（規格 §5.5 / §13.2 階段 0）：這個套件不得有任何瀏覽器相依。
 * 沒有 DOM、沒有 `window`、沒有 React —— `tsconfig.json` 不載入 `lib.dom`，
 * 且 ESLint 會擋掉 `react` / `next` / `@tiptap/*` / `prosemirror-view` 的 import
 * 與 `window`/`document` 全域。它必須能單獨在 Node 跑測試（PDF 匯出、場次表推導、
 * 伺服器端 command 都會用），也要能把同一份 schema 餵給日後的 Yjs 路徑。
 *
 * node spec 與 node view 分家（§5.5）：這裡只有 node spec；`toDOM`／`parseDOM`／
 * node view 住在 `apps/web` 的編輯器套件。
 */
export {
  schema,
  nullableSceneAttrNames,
  TIME_VALUES,
  INT_EXT_VALUES,
  MONTAGE,
  VOICE_VALUES,
} from "./schema";
export type {
  SceneTime,
  SceneIntExt,
  VoiceStyle,
  LocationRef,
  CharacterRef,
  ExtraRef,
  DialogueCharacterRef,
} from "./schema";

export { hasEmptySceneMeta } from "./scene-meta";

// 實體（人物／地點）：id 鑄造、command 問存在性用的目錄，與讀取路徑的正規化（票券 08）。
//
// ⚠️ 只出去有呼叫端的東西。`referenceLabel`（場次表那一格的文字）、`isCharacterId`／
// `isLocationId`、`splitNames`／`hasSeparator` 都還沒有消費者，留在模組裡 —— 它們的第一個
// 呼叫端會是票券 15／18，那天再開一行。沒有讀者的公開介面與沒有讀者的欄位是同一種債。
export {
  CHARACTER_ID_PREFIX,
  LOCATION_ID_PREFIX,
  mintCharacterId,
  mintLocationId,
  entityDirectory,
  sceneLocations,
  sceneAppearingCharacters,
  dialogueCharacters,
} from "./entities";
export type { EntityDirectory } from "./entities";

// 多值欄位的輸入規則（地點欄與登場人物欄共用同一份；貼上走同一條路）。
export { splitNamesLive } from "./names";

export { projectScenes, docFromJSON } from "./project-scenes";
export type { SceneNumber } from "./project-scenes";

export { mintId, mintSceneId, isSceneId, SCENE_ID_PREFIX } from "./ids";

// 寫入邊界：domain command 層（票券 03）。§6.3 —— 編輯器對外只曝露 command 與 projection。
export * from "./commands";
