/**
 * 場次導覽 sidebar 的列（票券 16，§7.10）。
 *
 * **sidebar ＝ 創作中的定位**（跟隨游標高亮、含草稿、只為了跳）；場次表 ＝ 交付用的投影。草稿是
 * 兩者唯一的分歧 —— 所以這裡不讀 `projectSceneTable`（它濾掉草稿），而是吃編輯器那一份場次號
 * （`editorSceneNumbers`，套上「離開時才判定」的鎖），gutter 印 `S5[D1]` 時 sidebar 也印 `S5[D1]`。
 *
 * 每列形如 `S1 內 日 廚房`（欄序比照 §8：場次號、景、光、地點）。地點印**這一場的顯示名** ——
 * 編劇在 chip row 裡看到的那個字；實體名只進篩選。
 */
import type { SceneNumber } from "@scenephonie/schema";
import {
  extrasLabel,
  referenceLabel,
  sceneAppearingCharacters,
  sceneExtras,
  sceneLocationLabel,
  sceneLocations,
} from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

import { forEachScene } from "@/editor/address";
import type { SceneFilterFields } from "@/scene-table/filter";

/**
 * 景的簡稱。sidebar 一列要短，但 `內外景` 不能取首字 —— 會跟 `內景` 撞成同一個 `內`。
 */
const INT_EXT_SHORT: Readonly<Record<string, string>> = {
  內景: "內",
  外景: "外",
  內外景: "內外",
  雜景: "雜",
};

/** 實體 id → 實體名（專案目錄）。只用在篩選。 */
export interface SceneNavNames {
  characters: ReadonlyMap<string, string>;
  locations: ReadonlyMap<string, string>;
}

/** sidebar 的一列 —— 一場（主場次、子場次或群組成員），畫出來的字都備好了。 */
export interface SceneNavRow {
  /** 永久 id。點擊跳轉掛在這裡，不掛場次號。 */
  sceneId: string;
  /** `S5`／`S5.1`；草稿是它自己的推導標籤 `S5[D1]`。 */
  label: string;
  /** 是不是草稿（推導的，§4.8）—— 草稿也列，但要看得出來。 */
  draft: boolean;
  /** 子場次 —— 縮排一級。 */
  sub: boolean;
  /**
   * 群組成員所屬的群組（成員的子場次跟著它的成員）—— 只為了讓同組的列**看得出同組**。群組本身
   * 不佔一列（它不佔號，§7.10）。不在群組裡是 `undefined`。
   */
  groupId?: string;
  /** 景的簡稱；還沒填是 `""`。 */
  intExt: string;
  time: string;
  /** 這一場的地點顯示名（雜景多地點以頓號串起）；還沒填是 `""`。 */
  location: string;
  /**
   * 篩選比的字（`filterScenes`）—— 與場次表同一組欄、同一種寫法：景是全稱、地點與人物是
   * `實體名（這一場的顯示名）`，所以畫面上沒印的實體名也找得到。
   */
  search: SceneFilterFields;
}

/**
 * 依文件順序，每一場一列。
 *
 * @param scenes 場次號（編輯器那一份 —— `editorSceneNumbers`）。
 * @param doc 同一個 state 的 doc，讀 metadata 用。
 */
export function sceneNavRows(
  scenes: readonly SceneNumber[],
  doc: PMNode,
  names: SceneNavNames,
): SceneNavRow[] {
  const nodes = new Map<string, PMNode>();
  forEachScene(doc, (node) => {
    nodes.set(node.attrs.sceneId as string, node);
  });

  /** 成員的 id → 它的群組，給成員的子場次查。 */
  const groupOf = new Map<string, string>();
  return scenes.flatMap((scene) => {
    const node = nodes.get(scene.sceneId);
    if (!node) return [];
    const groupId = scene.groupId ?? (scene.parentSceneId ? groupOf.get(scene.parentSceneId) : undefined);
    if (scene.groupId) groupOf.set(scene.sceneId, scene.groupId);
    return [
      {
        sceneId: scene.sceneId,
        label: scene.draft ? scene.label : `S${scene.label}`,
        draft: scene.draft,
        sub: scene.parentSceneId !== undefined,
        ...(groupId ? { groupId } : {}),
        intExt: INT_EXT_SHORT[node.attrs.intExt as string] ?? "",
        time: (node.attrs.time as string | null) ?? "",
        location: sceneLocationLabel(node) ?? "",
        search: searchFields(scene, node, names),
      },
    ];
  });
}

function searchFields(scene: SceneNumber, node: PMNode, names: SceneNavNames): SceneFilterFields {
  return {
    label: scene.label,
    intExt: (node.attrs.intExt as string | null) ?? "",
    time: (node.attrs.time as string | null) ?? "",
    location: sceneLocations(node.attrs.location)
      .map((r) => referenceLabel(r.displayName, names.locations.get(r.locationId)))
      .join("、"),
    appearingCharacters: sceneAppearingCharacters(node.attrs.appearingCharacters)
      .map((r) => referenceLabel(r.displayName, names.characters.get(r.characterId)))
      .join("、"),
    extras: extrasLabel(sceneExtras(node.attrs.extras)),
  };
}
