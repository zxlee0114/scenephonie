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
 * 人數必須是**正整數**：0 個背景演員等於沒有這一筆，小數與負數不是人。描述空白的那一筆
 * 也擋下來 —— 沒有描述的人數不知道是在數什麼。
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
  for (const extra of extras) {
    if (!isExtraId(extra.extraId)) {
      return reject(`群演 id「${extra.extraId}」不是 ex_ 開頭的識別碼`);
    }
    if (seen.has(extra.extraId)) return reject(`群演「${extra.extraId}」在同一場出現兩次`);
    seen.add(extra.extraId);
    if (extra.description.trim() === "") return reject("群演要有描述 —— 只有人數不知道是在數什麼");
    if (!Number.isInteger(extra.count) || extra.count < 1) {
      return reject(`群演「${extra.description}」的人數要是正整數，收到 ${extra.count}`);
    }
  }

  const scene = children[index]!;
  const next = [...children];
  next[index] = scene.type.create(
    { ...scene.attrs, extras: extras.map((e) => ({ ...e })) },
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
  let scene: ProseMirrorNode | null = null;
  doc.forEach((node) => {
    if (!scene && node.type.name === "scene" && node.attrs.sceneId === sceneId) scene = node;
  });
  if (!scene) return reject(`找不到 sceneId「${sceneId}」`);
  const current = sceneExtras((scene as ProseMirrorNode).attrs.extras);
  return setSceneExtras(doc, { sceneId, extras: [...current, ...extras] });
}
