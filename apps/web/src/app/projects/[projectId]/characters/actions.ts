"use server";

import { authorizeProject } from "@/authorization";
import { createCharacter, renameCharacter } from "@/entities";
import { retitleCharacterInScreenplay, scenesShowingCharacterName } from "@/persistence";
import { projectScreenplay } from "@/projects/project-store";

/**
 * 角色設定表（畫面上叫「人物介紹」）的寫入入口（票券 21 第 ② 片）。表本身走 `../documents/actions` 的 `saveDocumentAction`；
 * 這裡是**人物實體**那一半：建立、改名（介紹內文住在表上，跟著表存）。
 *
 * **授權在這裡**（不變式 H）：瀏覽器給的是字串，每一支都先換成 handle。人物屬於專案，所以授權主體是專案；
 * 改名要動到劇本時，劇本的 handle 由 `projectScreenplay` 從 gate 拿，不就地捏一個。
 */

/** 「＋ 新增人物」打了一個新名字：先建立人物（不變式 ⑧：先建立實體、再寫入 doc）。空名字不建。 */
export async function createCharacterAction(projectId: string, name: string): Promise<{ id: string; name: string } | null> {
  const project = await authorizeProject(projectId);
  const trimmed = name.trim();
  if (!project || !trimmed) return null;
  const created = await createCharacter(project, { name: trimmed });
  return { id: created.id, name: created.name };
}

/** 劇本裡還有幾場印著這個名字（改名前先數，數到 0 就不問）。 */
export async function scenesShowingCharacterNameAction(projectId: string, characterId: string, name: string): Promise<number> {
  const project = await authorizeProject(projectId);
  const screenplay = project && (await projectScreenplay(project));
  if (!screenplay) return 0;
  return scenesShowingCharacterName(screenplay, characterId, name);
}

/**
 * 改人物的名字；`retitle` 時連劇本裡還印著舊名的那幾場一起改。
 *
 * **不留半套**（同 `entity-field.tsx` 的 `renameEntity`）：人物先改 —— 這一步順便確認這筆人物屬於這個專案；
 * 劇本那一步做不成（一直搶不到存檔）就把人物的名字改回去，回 `false`。不會有「人物改了、劇本說好要跟
 * 卻沒跟」，也不會有「劇本改了、人物沒改」。
 */
export async function renameCharacterAction(
  projectId: string,
  characterId: string,
  from: string,
  to: string,
  retitle: boolean,
): Promise<boolean> {
  const project = await authorizeProject(projectId);
  const name = to.trim();
  if (!project || !name) return false;
  const renamed = await renameCharacter(project, characterId, name);
  if (!renamed || !retitle) return renamed !== null;

  const screenplay = await projectScreenplay(project);
  if (!screenplay || (await retitleCharacterInScreenplay(screenplay, { characterId, from, to: name }))) return true;
  await renameCharacter(project, characterId, from);
  return false;
}
