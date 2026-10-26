import { and, asc, eq } from "drizzle-orm";

import { mintCharacterId, mintLocationId } from "@scenephonie/schema";

import type { AuthorizedProject } from "@/authorization";
import { getDb } from "@/db/client";
import { characters, locations } from "@/db/schema";

/**
 * 人物與地點實體的存取（§4.7、[ADR-0005](../../../../docs/adr/0005-entities-exist-by-reference.md)）。
 *
 * **實體屬於專案，不屬於劇本** —— 所以這裡每一支都只吃 `AuthorizedProject`（不變式 H：
 * 沒授權就呼叫在型別上表示不出來）。影集那天人物跨集有身分連續性，這條路不必改。
 *
 * ⚠️ **這個模組沒有「刪除實體」，而且日後也不會有。** 存在＝被引用：編劇能做的只有拿掉引用，
 * 最後一個引用被拿掉時那筆實體自動變孤兒、從所有畫面消失（v1 永不清理，它不佔任何人的視野）。
 * 合併別名也不刪舊 id —— 把引用改指向新實體就好。`entity-boundary.test.ts` 守著這條線。
 *
 * ── 「先建立實體、再寫入 doc」──────────────────────────────────────────
 * `createCharacter`／`createLocation` 必須在 domain command 之前跑完，因為 command 的引用完整性
 * 檢查（不變式 ⑧）問的就是這張表。反過來的話，每一次「編劇打了一個新名字」都會被自己的
 * 不變式擋下（§6.6）。
 */

/** 一筆人物。`description` 是人物介紹的內文，消費者是 PDF 的人物介紹頁（票券 21）。 */
export type Character = {
  id: string;
  name: string;
  description: string | null;
};

/** 一筆地點。**沒有描述欄** —— 沒有任何比賽要求地點介紹（人物與地點唯一的不對稱）。 */
export type Location = {
  id: string;
  name: string;
};

/**
 * 一個專案的名字目錄。自動補全、場次表聚合與引用完整性檢查問的都是這一份。
 *
 * ⚠️ 它是**目錄不是「存在的實體清單」**：裡面可能有孤兒（沒有任何引用指向它）。孤兒不該出現在
 * 自動補全 —— 那是「哪些實體被引用」的問題，答案在 doc 裡，由呼叫端交叉比對（票券 15 的場次表
 * 也走同一條路）。目錄本身不知道也不該知道。
 */
export type ProjectEntities = {
  characters: Character[];
  locations: Location[];
};

/** 這個專案的人物與地點，依建立順序（早建立的在前 —— 自動補全的順序要穩定）。 */
export async function projectEntities(project: AuthorizedProject): Promise<ProjectEntities> {
  const db = getDb();
  const [characterRows, locationRows] = await Promise.all([
    db
      .select({ id: characters.id, name: characters.name, description: characters.description })
      .from(characters)
      .where(eq(characters.projectId, project.projectId))
      .orderBy(asc(characters.createdAt)),
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.projectId, project.projectId))
      .orderBy(asc(locations.createdAt)),
  ]);

  return { characters: characterRows, locations: locationRows };
}

/**
 * 建立一筆人物。**不查重** —— 同名不同實體是合法的（身分判準不是名字），而系統不可能懷疑
 * 「海豚公寓房間」就是「未知大樓房間」。要說出兩個名字指同一筆實體，走自動補全第三列
 * （「作為既有實體的另一個名字」）—— 那是編劇主動說的，不是我們猜的。
 */
export async function createCharacter(
  project: AuthorizedProject,
  input: { name: string; description?: string | null },
): Promise<Character> {
  const row = {
    id: mintCharacterId(),
    projectId: project.projectId,
    name: input.name,
    description: input.description ?? null,
  };
  await getDb().insert(characters).values(row);
  return { id: row.id, name: row.name, description: row.description };
}

/** 建立一筆地點。同上不查重。 */
export async function createLocation(
  project: AuthorizedProject,
  input: { name: string },
): Promise<Location> {
  const row = { id: mintLocationId(), projectId: project.projectId, name: input.name };
  await getDb().insert(locations).values(row);
  return { id: row.id, name: row.name };
}

/**
 * 改實體的名字。
 *
 * 名字是**真欄位**（初值＝建立時打的字），所以它可以改；改的是實體的名字，**不是各引用上的
 * 顯示名** —— 別名不存在實體上，改名不自動代換全文（漸進揭露下那可能正是編劇要的）。
 *
 * `projectId` 進 where 而不只是拿 handle 當通行證：授權與查詢是同一句 SQL，才不會有「授權了
 * A 專案卻改到 B 專案的實體」這條路。
 */
export async function renameCharacter(
  project: AuthorizedProject,
  characterId: string,
  name: string,
): Promise<Character | null> {
  const [row] = await getDb()
    .update(characters)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(characters.id, characterId), eq(characters.projectId, project.projectId)))
    .returning({ id: characters.id, name: characters.name, description: characters.description });
  return row ?? null;
}

export async function renameLocation(
  project: AuthorizedProject,
  locationId: string,
  name: string,
): Promise<Location | null> {
  const [row] = await getDb()
    .update(locations)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(locations.id, locationId), eq(locations.projectId, project.projectId)))
    .returning({ id: locations.id, name: locations.name });
  return row ?? null;
}
