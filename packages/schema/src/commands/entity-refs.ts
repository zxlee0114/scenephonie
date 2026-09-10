/**
 * 實體引用的寫入 command —— **不變式 ⑧ 的寫入那一半**（§6.6、§11、
 * [ADR-0005](../../../../docs/adr/0005-entities-exist-by-reference.md)）。
 *
 * > 所有 domain command **必須拒絕**建立對不存在實體的引用；建立實體時**先建立實體、再寫入 doc**。
 *
 * 另一半（讀取容忍懸空引用）在 `../entities.ts` 的 `sceneLocations`／`referenceLabel`。
 * **兩半必須並排讀** —— 單獨拿走任何一半，後人都會把另一半當成 bug 去「修」。
 *
 * ⚠️ 這裡的檢查對象是**實體表**（由呼叫端注入的 `EntityDirectory`），不是 doc 裡別處的引用。
 * 反過來的話，每一次「編劇打了一個新地點名」的流程都會被自己的不變式擋下 —— 那正是
 * 「先建立實體、再寫入 doc」不只是建議順序的原因。
 *
 * **准入判準（§6.3）**：三支都強制執行不變式 ⑧，且以 `sceneId`／實體 id 定址。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import type { EntityDirectory } from "../entities";
import { sceneLocations } from "../entities";
import type {
  CharacterRef,
  DialogueCharacterRef,
  ExtraRef,
  LocationRef,
  SceneIntExt,
} from "../schema";
import { MONTAGE } from "../schema";
import { type CommandResult, ok, reject } from "./result";
import { docFrom, replaceChild, topLevelArray } from "./tree";

/** 「先建立實體、再寫入 doc」—— 拒絕訊息刻意把這句話寫進去，因為它是這條規則的前提。 */
const missing = (kind: string, id: string) =>
  reject(`實體「${id}」不存在，不能建立${kind}引用 —— 先建立實體、再寫入 doc（不變式 ⑧）`);

interface SceneHit {
  readonly children: ProseMirrorNode[];
  readonly index: number;
  readonly scene: ProseMirrorNode;
}

function findScene(doc: ProseMirrorNode, sceneId: string): SceneHit | null {
  const children = topLevelArray(doc);
  const index = children.findIndex((n) => n.attrs.sceneId === sceneId);
  return index === -1 ? null : { children, index, scene: children[index]! };
}

function rebuild(hit: SceneHit, nextScene: ProseMirrorNode, what: string): CommandResult {
  const next = [...hit.children];
  next[hit.index] = nextScene;
  try {
    return ok(docFrom(next));
  } catch (err) {
    return reject(`${what}後 doc 不符 schema：${(err as Error).message}`);
  }
}

/** 同一個實體不該在同一欄出現兩次 —— 那不是「兩個地點」，是同一筆重複。 */
function firstDuplicate(ids: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

export interface SetSceneLocationsOptions {
  readonly sceneId: string;
  /** 這一場的地點引用，依欄位裡的順序。空陣列 ＝ 清空（寫回 `null`＝尚未填）。 */
  readonly refs: readonly LocationRef[];
  readonly directory: EntityDirectory;
}

/**
 * 場次的地點欄。
 *
 * **一律單值，唯一的逃生口是雜景**（§4.3）：`intExt === "雜景"` 的場次承認自己橫跨多地，
 * 地點欄才可多值、也可留空。其餘場次給第二個地點是「時空變了卻沒開新場次」，由 command
 * 自己拒絕 —— UI 擋得住滑鼠，擋不住伺服器端呼叫。
 *
 * 存回去的形狀跟著 §4.3 那張表：空 → `null`、一個 → 物件、多個 → 陣列（讀取端一律走
 * `sceneLocations()` 正規化，不必各自處理這三種）。
 */
export function setSceneLocations(
  doc: ProseMirrorNode,
  options: SetSceneLocationsOptions,
): CommandResult {
  const { sceneId, refs, directory } = options;

  const hit = findScene(doc, sceneId);
  if (!hit) return reject(`找不到 sceneId「${sceneId}」`);

  for (const ref of refs) {
    if (!directory.hasLocation(ref.locationId)) return missing("地點", ref.locationId);
  }
  const dup = firstDuplicate(refs.map((r) => r.locationId));
  if (dup) return reject(`地點「${dup}」在同一場出現兩次`);

  if (refs.length > 1 && hit.scene.attrs.intExt !== MONTAGE) {
    return reject("只有雜景的地點欄可以多值（§4.3：metadata 一律單值，雜景是唯一的逃生口）");
  }

  const location = refs.length === 0 ? null : refs.length === 1 ? { ...refs[0]! } : refs.map((r) => ({ ...r }));
  return rebuild(hit, hit.scene.type.create({ ...hit.scene.attrs, location }, hit.scene.content, hit.scene.marks), "寫入地點");
}

export interface SetSceneIntExtOptions {
  readonly sceneId: string;
  /** `null` ＝ 回到未選。 */
  readonly intExt: SceneIntExt | null;
}

/**
 * 場次的內外欄。
 *
 * 它之所以是 command 而不是一次 `updateAttributes`：**「地點欄可以有幾個值」是內外的函式**
 * （§4.3：metadata 一律單值，雜景是唯一的逃生口）。只在寫地點時檢查那條規則會留一個洞 ——
 * 設成雜景 → 填兩個地點 → 改回內景，doc 就留著一個非雜景的多值地點欄，而沒有任何一層拒絕過。
 *
 * 所以這裡**拒絕**離開雜景，而不是替編劇丟掉多出來的地點：那是他打進去的字，系統不在他背後
 * 刪。要改回內景，先把多餘的地點拿掉。
 *
 * （拒絕當下畫面上只會是「下拉沒有變」。把那句話說給編劇聽是雜景那一票的事 —— 那一票擁有
 * 雜景的完整 UX，這裡只負責不變式不被繞過。）
 */
export function setSceneIntExt(
  doc: ProseMirrorNode,
  options: SetSceneIntExtOptions,
): CommandResult {
  const { sceneId, intExt } = options;

  const hit = findScene(doc, sceneId);
  if (!hit) return reject(`找不到 sceneId「${sceneId}」`);

  const locations = sceneLocations(hit.scene.attrs.location);
  if (intExt !== MONTAGE && locations.length > 1) {
    return reject(
      `這一場有 ${locations.length} 個地點，只有雜景的地點欄可以多值 —— 先拿掉多餘的地點`,
    );
  }

  return rebuild(
    hit,
    hit.scene.type.create({ ...hit.scene.attrs, intExt }, hit.scene.content, hit.scene.marks),
    "寫入內外",
  );
}

export interface SetAppearingCharactersOptions {
  readonly sceneId: string;
  /** 這一場的登場人物引用。空陣列 ＝ 清空（寫回 `null`＝尚未填）。 */
  readonly refs: readonly CharacterRef[];
  readonly directory: EntityDirectory;
}

/**
 * 場次的登場人物欄。**判準是入鏡，不是有沒有台詞** —— 所以這支 command 只寫編劇填的東西，
 * 絕不從對白推導（推導會讓製片誤排演員通告，§4.7）。提示是另一件事，票券 10。
 */
export function setAppearingCharacters(
  doc: ProseMirrorNode,
  options: SetAppearingCharactersOptions,
): CommandResult {
  const { sceneId, refs, directory } = options;

  const hit = findScene(doc, sceneId);
  if (!hit) return reject(`找不到 sceneId「${sceneId}」`);

  for (const ref of refs) {
    if (!directory.hasCharacter(ref.characterId)) return missing("人物", ref.characterId);
  }
  const dup = firstDuplicate(refs.map((r) => r.characterId));
  if (dup) return reject(`人物「${dup}」在同一場出現兩次`);

  const appearingCharacters = refs.length === 0 ? null : refs.map((r) => ({ ...r }));
  return rebuild(
    hit,
    hit.scene.type.create(
      { ...hit.scene.attrs, appearingCharacters },
      hit.scene.content,
      hit.scene.marks,
    ),
    "寫入登場人物",
  );
}

export interface SetDialogueCharactersOptions {
  readonly sceneId: string;
  /** 場次內第幾個 `sceneBlock`（0-based）。傳遞參數，不被儲存（同 `setBlockType`）。 */
  readonly blockIndex: number;
  /** 說話的人；空陣列 ＝ 清掉（尚未指定說話者）。 */
  readonly refs: readonly DialogueCharacterRef[];
  readonly directory: EntityDirectory;
}

/**
 * 對白的人物欄。**必須是實體引用而非字串**（§4.7）—— 「哪幾場有這個人的聲音但沒入鏡」只能
 * 靠這一欄回答，字串答不了。
 *
 * 合法目標是**人物**或**本場次的群演**（§5.1）。群演是場次限定實體、id 只在該場次內有意義，
 * 所以它的存在性問的是這一場的 `extras`，不是專案的實體表 —— 同一條不變式，兩個目錄。
 *
 * **多值**：多個具名角色可以同時說一句台詞（齊聲）。attr 的形狀因此與地點欄同一套
 * （單值 ｜ 陣列 ｜ null），舊稿的單值物件照樣讀得出來。
 */
export function setDialogueCharacters(
  doc: ProseMirrorNode,
  options: SetDialogueCharactersOptions,
): CommandResult {
  const { sceneId, blockIndex, refs, directory } = options;

  const hit = findScene(doc, sceneId);
  if (!hit) return reject(`找不到 sceneId「${sceneId}」`);

  const { scene } = hit;
  if (blockIndex < 0 || blockIndex >= scene.childCount) {
    return reject(`場次「${sceneId}」沒有第 ${blockIndex} 個區塊（共 ${scene.childCount} 個）`);
  }
  const block = scene.child(blockIndex);
  if (block.type.name !== "dialogue") {
    return reject(`第 ${blockIndex} 個區塊是「${block.type.name}」，只有對白有人物欄`);
  }

  const extras = (scene.attrs.extras ?? []) as ExtraRef[];
  for (const ref of refs) {
    const isExtraHere = extras.some((e) => e.extraId === ref.id);
    if (!directory.hasCharacter(ref.id) && !isExtraHere) return missing("對白人物", ref.id);
  }
  const dup = firstDuplicate(refs.map((r) => r.id));
  if (dup) return reject(`對白人物「${dup}」在同一句出現兩次`);

  const character =
    refs.length === 0 ? null : refs.length === 1 ? { ...refs[0]! } : refs.map((r) => ({ ...r }));
  const nextBlock = block.type.create({ ...block.attrs, character }, block.content, block.marks);
  return rebuild(hit, replaceChild(scene, blockIndex, nextBlock), "寫入對白人物");
}
