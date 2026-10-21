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
  SUBSCENE_KINDS,
} from "./schema";
export type {
  SceneTime,
  SceneIntExt,
  VoiceStyle,
  LocationRef,
  CharacterRef,
  ExtraRef,
  DialogueCharacterRef,
  SubsceneKind,
} from "./schema";

export { hasEmptySceneMeta } from "./scene-meta";

// 登場人物提示的觸發條件（票券 10）—— 提示不是推導，這支只回答「該不該問」，從不寫 doc。
export { unlistedSpeakers } from "./appearing-prompt";

// 實體（人物／地點）：id 鑄造、command 問存在性用的目錄，與讀取路徑的正規化（票券 08）。
//
// ⚠️ 只出去有呼叫端的東西。`referenceLabel`（`實體名（這一場的顯示名）`）除了同套件的
// `labelSceneTable`（票券 15），場次導覽 sidebar 的篩選（票券 16）也要拼同一串字 —— 同一個詞在
// 場次表找得到、在 sidebar 找不到，會讓人以為其中一邊壞了。`isCharacterId`／`isLocationId`、
// `splitNames`／`hasSeparator` 都還沒有消費者，留在模組裡 —— 第一個呼叫端會是票券 18，那天
// 再開一行。沒有讀者的公開介面與沒有讀者的欄位是同一種債。
export {
  CHARACTER_ID_PREFIX,
  LOCATION_ID_PREFIX,
  mintCharacterId,
  mintLocationId,
  entityDirectory,
  sceneLocations,
  sceneAppearingCharacters,
  dialogueCharacters,
  referenceLabel,
} from "./entities";
export type { EntityDirectory } from "./entities";

// 群演（場次限定實體，票券 09）：id 鑄造、讀取正規化、「描述 x 人數」的解析。場次表那一格
// 的文字（`extrasLabel`）由同套件的 `labelSceneTable` 呼叫（票券 15），sidebar 的篩選（票券 16）
// 比的是同一串字，與 `referenceLabel` 一起出去。
//
// `statesCount`（票券 49）是「新增那一側沒說人數就問一次」那條規則的判準 —— 唯一的呼叫端
// 是群演欄的 `willAskCount`。它與 `parseExtra` 的差別見它自己的檔頭：值上分不出「他說了
// 若干」與「他沒說」，只有那串字分得出來。
export {
  EXTRA_ID_PREFIX,
  mintExtraId,
  isExtraId,
  sceneExtras,
  parseExtra,
  statesCount,
  formatExtra,
  extrasLabel,
} from "./extras";

// 人數的四種樣子（票券 44）。型別要出得去，因為 `ExtraRef.countValue` 是公開形狀的一部分。
//
// 人數子選單（票券 48）是那幾支純函式的第一個套件外呼叫端：輸入格的解析（`resolveCountInput`）、
// 底下那一行提示（`countHintText`）、列印括號裡那一段（`formatCount`／`SOME_LABEL`）。
// 升格那一列的措辭（票券 49）是 `remainingExtraText` 的第一個呼叫端 —— 「`3-5` 減一是多少」
// 仍然只有 `countAfterTakingOne` 一個答案，畫面拿到的是**翻成話之後**的那一份。
// `countLowerBound`／`countAfterTakingOne`／`countValueOf` 仍然沒有套件外的讀者，照這個檔案
// 既有的規矩留在模組裡 —— 沒有讀者的公開介面是一種債。
export {
  SOME_LABEL,
  countHintText,
  formatCount,
  remainingExtraText,
  resolveCountInput,
} from "./count";
export type { CountInputResult, CountValue } from "./count";

// 多值欄位的輸入規則（地點欄與登場人物欄共用同一份；貼上走同一條路）。
export { splitNamesLive } from "./names";

// 子場次的推導值（票券 11）：折返標記（編輯器 decoration，日後 PDF 同一支）。
//
// 不變式 ② 與 ③ 的判準（`subsceneEchoesParent`、`echoingMembers`）收回模組裡了：它們唯一的
// 呼叫端是 `projectScenes` 的草稿推導（票券 14），套件外要問「這場是不是草稿」讀的是推導結果的
// `draft`，不是再拼一次判準。`echoingMembers` 的下一個讀者會是 PDF 歸屬標記（票券 18），那天再開。
export { returnMarkers, sceneLocationLabel, subsceneTimeOptions } from "./subscenes";
export type { ReturnMarker } from "./subscenes";

// `projectScenesWhileEditing`／`autoDraftOf`：編輯器的「離開時才判定」（票券 14）—— 只有編輯器用
// （場次號 decoration 與 slash 選單列的場次號，兩邊讀同一份才一致）。
export { projectScenes, projectScenesWhileEditing, autoDraftOf, docFromJSON } from "./project-scenes";
export type { SceneNumber, DraftHold } from "./project-scenes";

// 場次表（票券 15，§8）：第一層投影。`projectSceneTable` 只吃 doc（零新增資訊）；
// `labelSceneTable` 把實體名接上去、印成字，`missingRefs` 是它的診斷輸出（§6.6）。
export { projectSceneTable, labelSceneTable } from "./scene-table";
export type { LabeledSceneTableRow } from "./scene-table";

// 交付（票券 17，§4.9、ADR-0008）：建立交付那個交易裡唯一的推導。payload 是推導的結果、純 JSON；
// 渲染器與凍結分享頁只讀它，不准從它重算語意推導值（不變式 E）。唯一的套件外呼叫端是
// persistence 的 `createDelivery`／`loadDelivery`。元素型別與 `DELIVERY_PAYLOAD_VERSION` 的讀者是
// 票券 18 的渲染器 —— 它認得哪一版形狀、照元素印字，不重算任何一個值。
export { projectDelivery, DELIVERY_PAYLOAD_VERSION } from "./delivery";
export type {
  DeliveryPayload,
  DeliveredScene,
  DeliveredRef,
  DisambiguatingField,
  ScriptElement,
} from "./delivery";

export {
  mintId,
  mintSceneId,
  isSceneId,
  SCENE_ID_PREFIX,
  mintGroupId,
} from "./ids";

// 寫入邊界：domain command 層（票券 03）。§6.3 —— 編輯器對外只曝露 command 與 projection。
export * from "./commands";
