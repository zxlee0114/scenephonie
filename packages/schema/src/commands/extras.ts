/**
 * 群演欄的寫入 command（§4.7、票券 09）。
 *
 * 群演是**場次限定實體**：`extraId` 只在該場次內有意義，沒有實體表、沒有目錄，所以這裡
 * **沒有** `EntityDirectory` 這個參數 —— 不變式 ⑧ 問的是「這筆實體在專案的表裡嗎」，而群演
 * 的家就是它所在那個場次的 attr。存在性因此是**自明的**：寫進去它就在了。
 *
 * ⚠️ **拿掉一筆群演不會回頭改對白**。對白的人物欄可以指向本場的群演（§5.1），拿掉之後那個
 * 引用就懸空 —— 而懸空引用是**合法的讀取狀態**（§6.6）：顯示名照印、不跳警告、不少印一句
 * 台詞。反過來做（連帶清掉對白的人物欄）等於系統在編劇背後動他寫好的對白。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { countAfterTakingOne, countValueOf } from "../count";
import { isExtraId, sceneExtras } from "../extras";
import type { ExtraRef } from "../schema";
import { type CommandResult, ok, reject } from "./result";
import { docFrom, topLevelArray } from "./tree";

export interface SetSceneExtrasOptions {
  readonly sceneId: string;
  /** 這一場的群演，依欄位裡的順序。空陣列 ＝ 這一場沒有群演（寫回 `[]`，不是 null）。 */
  readonly extras: readonly ExtraRef[];
}

/**
 * 場次的群演欄。
 *
 * **多值是這一欄的性質**（`咖啡廳客人 x8、服務生 x2`）—— 與地點欄相反，那裡多值是雜景的
 * 性質。理由是同一個時空本來就可以同時有好幾批背景演員，那不動搖場次的身分。
 *
 * 人數必須是**四種樣子之一**（票券 46 把合法性從「正整數」搬到這裡）：確切、區間、下限、
 * 若干。拒收的因此是**壞形狀** —— `{ kind: "range", from: 5, to: 3 }`、`kind` 不認得、
 * 根本不是一個值 —— 而不是「非正整數」，因為區間與若干本來就不是一個整數。
 * 描述空白的那一筆照樣擋下來 —— 沒有描述的人數不知道是在數什麼。
 */
export function setSceneExtras(
  doc: ProseMirrorNode,
  options: SetSceneExtrasOptions,
): CommandResult {
  const { sceneId, extras } = options;

  const children = topLevelArray(doc);
  const index = children.findIndex((n) => n.attrs.sceneId === sceneId);
  if (index === -1) return reject(`找不到 sceneId「${sceneId}」`);

  const seen = new Set<string>();
  const normalized: ExtraRef[] = [];
  for (const extra of extras) {
    if (!isExtraId(extra.extraId)) {
      return reject(`群演 id「${extra.extraId}」不是 ex_ 開頭的識別碼`);
    }
    if (seen.has(extra.extraId)) return reject(`群演「${extra.extraId}」在同一場出現兩次`);
    seen.add(extra.extraId);
    if (extra.description.trim() === "") return reject("群演要有描述 —— 只有人數不知道是在數什麼");
    // ⚠️ 寫入端**不學讀取路徑補「若干」**（`sceneExtras` 的 `readCount` 補得起，是因為它面對的
    // 是已經躺在 doc 裡的資料，少讀一筆不如讀歪一筆）。這裡手上那一筆還沒落地，一個推不出
    // 樣子的人數是呼叫端的 bug，靜靜補一個值等於把它藏起來 —— 所以走嚴格的 `countValueOf`。
    const countValue = countValueOf(extra.countValue);
    if (!countValue) {
      return reject(`群演「${extra.description}」的人數不是四種樣子裡的任何一種`);
    }
    normalized.push({
      extraId: extra.extraId,
      description: extra.description,
      countValue,
    });
  }

  const scene = children[index]!;
  const next = [...children];
  next[index] = scene.type.create(
    { ...scene.attrs, extras: normalized },
    scene.content,
    scene.marks,
  );
  try {
    return ok(docFrom(next));
  } catch (err) {
    return reject(`寫入群演後 doc 不符 schema：${(err as Error).message}`);
  }
}

export interface AddSceneExtrasOptions {
  readonly sceneId: string;
  /** 要**加上去**的群演（既有的原封保留，順序接在後面）。 */
  readonly extras: readonly ExtraRef[];
}

/**
 * 在既有的群演之後**加**幾筆。
 *
 * 存在的理由是呼叫端：對白人物欄新建一筆群演時，它要的是「多一筆」而不是「這一場的群演
 * 現在是這些」—— 讓 UI 自己去讀現況再併起來，等於把 doc 的 read-modify-write 搬到畫面那一側，
 * 而畫面讀到的可能是上一次重繪的那一份（票券 08 那個時間差家族）。合併在 kernel 做，
 * 讀的就一定是這支 command 收到的那份 doc。
 */
export function addSceneExtras(
  doc: ProseMirrorNode,
  options: AddSceneExtrasOptions,
): CommandResult {
  const { sceneId, extras } = options;
  const scene = findScene(doc, sceneId);
  if (!scene) return reject(`找不到 sceneId「${sceneId}」`);
  const current = sceneExtras(scene.attrs.extras);
  return setSceneExtras(doc, { sceneId, extras: [...current, ...extras] });
}

/**
 * 頂層那一場。**不用 `topLevelArray`**：要讀的只是一個 attr，把整份 doc 攤成陣列是多的。
 * 「讀現況再改」的那幾支 command 共用它（見 `addSceneExtras` 檔頭那條理由）。
 */
function findScene(doc: ProseMirrorNode, sceneId: string): ProseMirrorNode | null {
  let found: ProseMirrorNode | null = null;
  doc.forEach((node) => {
    if (!found && node.type.name === "scene" && node.attrs.sceneId === sceneId) found = node;
  });
  return found;
}

export interface TakeOneFromExtraOptions {
  readonly sceneId: string;
  /** 要少一個人的那批群演。**必須是這一場的** —— 群演是場次限定實體。 */
  readonly extraId: string;
}

/**
 * 從那批人裡**拉走一個** —— 升格（票券 35）的群演那一半。
 *
 * 另一半（那個人物落地、對白的引用指向他）住在畫面那一側，因為它要經過實體目錄；兩半在
 * 呼叫端串成**同一個 transaction**，⌘Z 一次回到升格前。
 *
 * **只有「確切」走得到「減到 0 就整筆移除」**（票券 46）：0 個背景演員等於沒有這一筆（票券 09
 * 已裁決，同 `parseExtra` 拒收 `x0` 的那條理由，留著的話場次表會印出一個不存在的需求）——
 * 但區間、下限、若干**減不到 0**，它們本來就沒有說死有幾個人，拉走一個不會讓那批人消失。
 * 票券 35 那條裁決因此是**加一個條件，不是被推翻**。
 *
 * 「剩多少」這件事這裡不自己算，`countAfterTakingOne` 是唯一真相來源 —— 措辭那一側
 * （票券 49 的「群演剩 2-4 人」）吃的是同一個函式，畫面不該自己決定 `3-5` 減一是多少。
 *
 * ⚠️ 找不到那筆群演就**拒絕**，不當作沒事發生。呼叫端要的是「那批人少一個」，少掉的那一個
 * 已經在同一個 transaction 裡變成人物了 —— 靜靜跳過等於憑空多一個演員。別場的 `extraId`
 * 走的也是這條路（`id` 只在該場次內有意義），那條沒有商量餘地。
 */
export function takeOneFromExtra(
  doc: ProseMirrorNode,
  options: TakeOneFromExtraOptions,
): CommandResult {
  const { sceneId, extraId } = options;
  const scene = findScene(doc, sceneId);
  if (!scene) return reject(`找不到 sceneId「${sceneId}」`);

  const current = sceneExtras(scene.attrs.extras);
  if (!current.some((e) => e.extraId === extraId)) {
    return reject(`場次「${sceneId}」沒有群演「${extraId}」—— 群演是場次限定實體`);
  }

  const next = current.flatMap((e) => {
    if (e.extraId !== extraId) return [e];
    const left = countAfterTakingOne(e.countValue);
    return left ? [{ ...e, countValue: left }] : [];
  });
  return setSceneExtras(doc, { sceneId, extras: next });
}
