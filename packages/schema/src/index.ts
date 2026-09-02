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

export { projectScenes, docFromJSON } from "./project-scenes";
export type { SceneNumber } from "./project-scenes";

export { mintSceneId, isSceneId, SCENE_ID_PREFIX } from "./ids";
