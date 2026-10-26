import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintId, mintSceneId, sceneAppearingCharacters } from "@scenephonie/schema";

import {
  authorizeProjectForUser,
  authorizeScreenplayForUser,
  type AuthorizedProject,
  type AuthorizedScreenplay,
} from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, users } from "@/db/schema";
import { createCharacter } from "@/entities";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import { characterSheetCharacterIds, listDocuments, openCharacterSheet, saveDocument } from "./document-store";
import type { PersistedDoc } from "./doc-schema-version";
import { createScreenplay, loadScreenplay, retitleCharacterInScreenplay, scenesShowingCharacterName } from "./screenplay-store";

/**
 * 角色設定表（票券 21 第 ② 片）—— 人物實體的第三個引用來源，要跨文件算的那一半。
 * 沒有 `DATABASE_URL` 就整組跳過。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const sheetOf = (...ids: string[]): PersistedDoc => ({
  type: "doc",
  content: ids.map((characterId) => ({ type: "characterEntry", attrs: { characterId }, content: [{ type: "paragraph" }] })),
});

/** 一份劇本：每個參數是一場，那一場的登場人物欄只有這一筆。 */
const screenplayShowing = (...refs: { characterId: string; displayName: string }[]): PersistedDoc => ({
  type: "doc",
  content: refs.map((ref) => ({
    type: "scene",
    attrs: { sceneId: mintSceneId(), appearingCharacters: [ref] },
    content: [{ type: "action" }],
  })),
});

describe.skipIf(!hasDatabase)("角色設定表（需要 Postgres）", () => {
  const ownerId = mintId(USER_ID_PREFIX);
  let project: AuthorizedProject;
  let screenplay: AuthorizedScreenplay;

  beforeAll(async () => {
    await getDb().insert(users).values({ id: ownerId, name: "測試", email: `${ownerId}@example.test` });
    const projectId = mintId(PROJECT_ID_PREFIX);
    await getDb().insert(projects).values({ id: projectId, type: SINGLE_SCREENPLAY_PROJECT, title: "測試專案", ownerId });
    project = (await authorizeProjectForUser(ownerId, projectId))!;
  });

  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, ownerId));
  });

  it("還沒打開過：表上沒有人，而且問這一句不會替它建一份", async () => {
    expect(await characterSheetCharacterIds(project)).toEqual([]);
    expect((await listDocuments(project)).some((d) => d.kind === "角色設定表")).toBe(false);
  });

  it("第一次打開時建立一份零筆的表；兩個分頁同時打開也只有一份", async () => {
    const [a, b] = await Promise.all([openCharacterSheet(project), openCharacterSheet(project)]);
    expect(a.documentId).toBe(b.documentId);
    expect(a.body).toEqual(sheetOf());
    expect((await listDocuments(project)).filter((d) => d.kind === "角色設定表")).toHaveLength(1);
  });

  it("表上收錄的人，依表上的順序 —— 劇本那一側拿它判斷「存在」", async () => {
    const ruoqing = await createCharacter(project, { name: "若晴" });
    const xiaoming = await createCharacter(project, { name: "小明" });
    const sheet = await openCharacterSheet(project);
    const saved = await saveDocument({ unit: project, documentId: sheet.documentId, body: sheetOf(xiaoming.id, ruoqing.id), token: sheet.token });
    expect(saved.status).toBe("saved");

    expect(await characterSheetCharacterIds(project)).toEqual([xiaoming.id, ruoqing.id]);
  });

  describe("在人物介紹改名時，劇本裡印著舊名的那幾場", () => {
    let xiaoming: { id: string };

    beforeAll(async () => {
      xiaoming = await createCharacter(project, { name: "小明" });
      const { screenplayId } = await createScreenplay(
        project,
        screenplayShowing(
          { characterId: xiaoming.id, displayName: "小明" },
          { characterId: xiaoming.id, displayName: "小明" },
          // 這一場刻意取了別名：它本來就不打算跟著實體名走（ADR-0005）。
          { characterId: xiaoming.id, displayName: "明哥" },
        ),
        { title: "測試劇本" },
      );
      screenplay = (await authorizeScreenplayForUser(ownerId, screenplayId))!;
    });

    it("數得出還有幾場印著舊名（別名那一場不算）", async () => {
      expect(await scenesShowingCharacterName(screenplay, xiaoming.id, "小明")).toBe(2);
    });

    it("一起改：印著舊名的換成新名，取了別名的不動", async () => {
      expect(await retitleCharacterInScreenplay(screenplay, { characterId: xiaoming.id, from: "小明", to: "王小明" })).toBe(true);

      const loaded = await loadScreenplay(screenplay);
      const shown = (loaded!.doc.content as { attrs: { appearingCharacters: unknown } }[]).map(
        (scene) => sceneAppearingCharacters(scene.attrs.appearingCharacters)[0]!.displayName,
      );
      expect(shown).toEqual(["王小明", "王小明", "明哥"]);
    });

    it("劇本存檔的序號往前走 —— 開著那份劇本的分頁下次存檔會知道別處改過了", async () => {
      const before = await loadScreenplay(screenplay);
      await retitleCharacterInScreenplay(screenplay, { characterId: xiaoming.id, from: "王小明", to: "小明" });
      expect((await loadScreenplay(screenplay))!.token).not.toBe(before!.token);
    });
  });
});
