/**
 * entities —— 人物與地點的名字目錄（票券 08）。
 *
 * 對外只有：讀目錄、建一筆、改名字。**沒有刪除** —— 存在＝被引用（ADR-0005），
 * 拿掉最後一個引用就是「刪掉」，那件事發生在 doc 裡，不在這裡。
 */
export {
  projectEntities,
  createCharacter,
  createLocation,
  renameCharacter,
  renameLocation,
} from "./entity-store";
export type { Character, Location, ProjectEntities } from "./entity-store";
