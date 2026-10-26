/**
 * 角色設定表的 command 與讀取（票券 21 第 ② 片，§6.2、[ADR-0005](../../../../docs/adr/0005-entities-exist-by-reference.md)）。
 *
 * 角色設定表是人物實體的**第三個引用來源**（另兩個是場次 metadata 與對白人物欄）。收錄一個人就是產生一個
 * 引用，所以寫入那一半跟劇本裡的 chip 守同一條不變式 ⑧：**拒絕對不存在實體的引用，先建立實體、再寫入 doc**。
 *
 * 移除與排序沒有 command：一筆就是一個節點（連同他的介紹內文），刪掉與拖曳是 ProseMirror 本來就會的事，
 * 不會長出新的引用（不碰 ⑧），也不會讓同一個人出現兩次。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { isCharacterId, type EntityDirectory } from "../entities";
import { type CommandResult, ok, reject } from "./result";

export interface AddCharacterEntryOptions {
  readonly characterId: string;
  readonly directory: EntityDirectory;
}

/**
 * 把一位人物收錄進表，排在最後，底下一段空的介紹內文等著寫。
 *
 * **同一個人不收兩次**：表的每一筆是「收錄了誰」，第二筆不帶來任何新資訊，印出來卻是同一段介紹兩遍。
 */
export function addCharacterEntry(doc: ProseMirrorNode, options: AddCharacterEntryOptions): CommandResult {
  const { characterId, directory } = options;
  if (!directory.hasCharacter(characterId)) {
    return reject(`實體「${characterId}」不存在，不能收錄進角色設定表 —— 先建立實體、再寫入 doc（不變式 ⑧）`);
  }
  if (characterSheetIds(doc.toJSON()).includes(characterId)) {
    return reject(`人物「${characterId}」已經在角色設定表上`);
  }
  const entry = doc.type.schema.nodes.characterEntry!.createAndFill({ characterId })!;
  return ok(doc.copy(doc.content.addToEnd(entry)));
}

/**
 * 表上收錄了誰，依表上的順序。吃存下來的 JSON、不 hydrate：伺服器端拿它回答「這個人物在表上被引用了沒」
 * （存在＝被引用，要跨文件算）。
 *
 * **讀取容忍壞形狀**（§6.6）：認不得的節點略過，寧可少讀一筆，也不讓整份表讀不出來。
 */
export function characterSheetIds(json: unknown): string[] {
  const content = (json as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((node: unknown) => {
    const entry = node as { type?: unknown; attrs?: { characterId?: unknown } } | null;
    const id = entry?.type === "characterEntry" ? entry.attrs?.characterId : undefined;
    return isCharacterId(id) ? [id] : [];
  });
}
