import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { docFromJSON, entityDirectory, mintId, setSceneLocations } from "@scenephonie/schema";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { emptyScreenplay } from "@/editor/empty-screenplay";
import { landingProject } from "@/projects/project-store";

import { createCharacter, createLocation, projectEntities, renameLocation } from "./entity-store";

/**
 * 實體表是專案層的 append-only 名字目錄（票券 08）。
 *
 * 這裡順便把「先建立實體、再寫入 doc」那條順序測成一個真的流程 —— 它跨了兩個儲存體
 * （Postgres 的實體表、doc 的引用），所以只在整合測試裡才看得到全貌。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("人物與地點實體（需要 Postgres）", () => {
  const createdUsers: string[] = [];

  const newProject = async () => {
    const id = mintId(USER_ID_PREFIX);
    await getDb().insert(users).values({ id, name: "測試", email: `${id}@example.test` });
    createdUsers.push(id);
    return landingProject(id);
  };

  afterAll(async () => {
    if (createdUsers.length > 0) await getDb().delete(users).where(inArray(users.id, createdUsers));
  });

  it("人物與地點都掛在專案上，不掛在劇本上", async () => {
    const project = await newProject();

    const xiaoming = await createCharacter(project, { name: "小明", description: "高中生" });
    const dolphinApartment = await createLocation(project, { name: "海豚公寓房間" });

    const found = await projectEntities(project);
    expect(found.characters).toEqual([{ id: xiaoming.id, name: "小明", description: "高中生" }]);
    expect(found.locations).toEqual([{ id: dolphinApartment.id, name: "海豚公寓房間" }]);
    expect(xiaoming.id).toMatch(/^ch_/);
    expect(dolphinApartment.id).toMatch(/^lo_/);
  });

  it("地點沒有描述欄 —— 建立與讀取的形狀裡都沒有那個欄位", async () => {
    const project = await newProject();
    const policeStation = await createLocation(project, { name: "派出所" });

    expect(Object.keys(policeStation).sort()).toEqual(["id", "name"]);
  });

  it("同名可以是兩筆不同實體（身分判準不是名字，是美術上要不要分開處理）", async () => {
    const project = await newProject();

    const classroomThen = await createLocation(project, { name: "教室" });
    const classroomNow = await createLocation(project, { name: "教室" });

    expect(classroomThen.id).not.toBe(classroomNow.id);
    expect((await projectEntities(project)).locations).toHaveLength(2);
  });

  it("名字是真欄位，可以改 —— 但改的是實體的名字，不是各引用上的顯示名", async () => {
    const project = await newProject();
    const seededLocation = await createLocation(project, { name: "未知大樓房間" });

    const renamed = await renameLocation(project, seededLocation.id, "海豚公寓房間");

    expect(renamed).toEqual({ id: seededLocation.id, name: "海豚公寓房間" });
  });

  it("別的專案的實體改不到（授權與查詢是同一句 SQL）", async () => {
    const mine = await newProject();
    const theirs = await newProject();
    const seededLocation = await createLocation(theirs, { name: "派出所" });

    expect(await renameLocation(mine, seededLocation.id, "海豚公寓房間")).toBeNull();
  });

  it("先建立實體、再寫入 doc —— command 這時才放行那筆引用", async () => {
    const project = await newProject();
    const doc = docFromJSON(emptyScreenplay());
    const sceneId = doc.child(0).attrs.sceneId as string;

    // 反過來的順序：doc 先寫、實體還不在 → 不變式 ⑧ 擋下。這正是「先建立實體」不只是
    // 建議順序的原因：檢查對象是實體表。
    const tooEarly = setSceneLocations(doc, {
      sceneId,
      refs: [{ locationId: "lo_還沒建", displayName: "海豚公寓房間" }],
      directory: entityDirectory({}),
    });
    expect(tooEarly.ok).toBe(false);

    // 正確順序：實體先落地，目錄才答得出「在」。
    const seededLocation = await createLocation(project, { name: "海豚公寓房間" });
    const directory = entityDirectory({
      locationIds: (await projectEntities(project)).locations.map((l) => l.id),
    });
    const written = setSceneLocations(doc, {
      sceneId,
      // 顯示名刻意與實體名不同 —— 漸進揭露，寫入不會把它正規化掉。
      refs: [{ locationId: seededLocation.id, displayName: "未知大樓房間" }],
      directory,
    });

    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.value.child(0).attrs.location).toEqual({
      locationId: seededLocation.id,
      displayName: "未知大樓房間",
    });
  });
});
