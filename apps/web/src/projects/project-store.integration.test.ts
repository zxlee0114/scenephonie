import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { mintId } from "@scenephonie/schema";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { deliveries, projects, screenplays, shareLinks, users } from "@/db/schema";

import { authorizeDeletedProjectForUser, authorizeProjectForUser, authorizeScreenplayForUser } from "@/authorization";
import {
  createDelivery,
  createFreeDocument,
  deleteDocument,
  listDocuments,
  openSubmissionOutline,
  saveDocument,
} from "@/persistence";
import { revokeShareLinks, shareDelivery, shareLive } from "@/share/share-store";

import {
  archiveProject,
  createProject,
  deleteProject,
  landingProject,
  ownedProjects,
  projectContents,
  purgeDeletedProjects,
  restoreProject,
  unarchiveProject,
} from "./project-store";
import { projectPurgeCutoff } from "./retention";

/**
 * 登入後的落點是**一次 GET 上的寫入**，所以它必須冪等 —— 第一次登入時的重試、prefetch
 * 或兩個分頁會同時走到這裡，多開的那一個不會有人去刪：不能靠「應該不會同時發生」來防。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("登入後的落點（需要 Postgres）", () => {
  const createdUsers: string[] = [];

  const newUser = async (): Promise<string> => {
    const id = mintId(USER_ID_PREFIX);
    await getDb().insert(users).values({ id, name: "測試", email: `${id}@example.test` });
    createdUsers.push(id);
    return id;
  };

  afterAll(async () => {
    if (createdUsers.length > 0) await getDb().delete(users).where(inArray(users.id, createdUsers));
  });

  it("第一次登入拿到一個專案，連同它那一份劇本", async () => {
    const ownerId = await newUser();

    const project = await landingProject(ownerId);

    expect(project.ownerId).toBe(ownerId);
    const { screenplayId } = await projectContents(project);
    expect(screenplayId).toMatch(/^sp_.+/);
  });

  it("再進來一次是同一個專案，不是第二個", async () => {
    const ownerId = await newUser();

    const first = await landingProject(ownerId);
    const second = await landingProject(ownerId);

    expect(second.projectId).toBe(first.projectId);
    expect(await ownedProjects(ownerId)).toHaveLength(1);
  });

  it("兩個分頁同時第一次登入：仍然只有一個專案、一份劇本", async () => {
    const ownerId = await newUser();

    const [a, b] = await Promise.all([landingProject(ownerId), landingProject(ownerId)]);

    expect(a.projectId).toBe(b.projectId);
    expect(await ownedProjects(ownerId)).toHaveLength(1);

    const scripts = await getDb()
      .select({ id: screenplays.id })
      .from(screenplays)
      .where(eq(screenplays.projectId, a.projectId));
    expect(scripts).toHaveLength(1);
  });
});

/** 一段字的散文 doc —— 精靈第二步打進去的東西。 */
const prose = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const blank = () => ({ type: "doc", content: [{ type: "paragraph" }] });

describe.skipIf(!hasDatabase)("建立專案（票券 71，需要 Postgres）", () => {
  const createdUsers: string[] = [];

  const newUser = async (): Promise<string> => {
    const id = mintId(USER_ID_PREFIX);
    await getDb().insert(users).values({ id, name: "測試", email: `${id}@example.test` });
    createdUsers.push(id);
    return id;
  };

  afterAll(async () => {
    if (createdUsers.length > 0) await getDb().delete(users).where(inArray(users.id, createdUsers));
  });

  const draft = (overrides: Partial<Parameters<typeof createProject>[1]> = {}) => ({
    creationId: mintId("cr_"),
    projectTitle: "海豚計畫",
    screenplayTitle: "海豚公寓",
    submissionOutline: prose("一個關於海豚的故事。"),
    sceneOutline: blank(),
    ...overrides,
  });

  it("一次建好專案、劇本（帶劇本名稱）與兩份大綱；空的大綱也建，是空文件", async () => {
    const ownerId = await newUser();

    const { projectId } = await createProject(ownerId, draft());

    const project = (await authorizeProjectForUser(ownerId, projectId))!;
    const contents = await projectContents(project);
    expect(contents.title).toBe("海豚計畫");
    expect(contents.screenplayTitle).toBe("海豚公寓");
    expect(contents.screenplayId).toMatch(/^sp_.+/);
    const documents = await listDocuments(project);
    expect(Object.fromEntries(documents.map(({ kind, words }) => [kind, words]))).toEqual({
      交件大綱: 10,
      分場大綱: 0,
    });
  });

  it("同一個建立鍵送兩次（含同時送）：只有一個專案，兩次拿到同一個", async () => {
    const ownerId = await newUser();
    const once = draft();

    const [a, b] = await Promise.all([createProject(ownerId, once), createProject(ownerId, once)]);
    const c = await createProject(ownerId, once);

    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(await ownedProjects(ownerId)).toHaveLength(1);
  });

  it("不同的建立鍵是兩個專案", async () => {
    const ownerId = await newUser();

    await createProject(ownerId, draft());
    await createProject(ownerId, draft());

    expect(await ownedProjects(ownerId)).toHaveLength(2);
  });

  it("大綱內文過不了那個 kind 的 schema：整組回滾，一列都不留", async () => {
    const ownerId = await newUser();

    await expect(
      createProject(ownerId, draft({ sceneOutline: { type: "doc", content: [{ type: "scene" }] } })),
    ).rejects.toThrow();

    expect(await ownedProjects(ownerId)).toEqual([]);
  });

  it("名稱只有空白：拒絕，什麼都不建；有字的名稱去掉頭尾空白", async () => {
    const ownerId = await newUser();

    await expect(createProject(ownerId, draft({ projectTitle: "   " }))).rejects.toThrow();
    await expect(createProject(ownerId, draft({ screenplayTitle: "" }))).rejects.toThrow();
    expect(await ownedProjects(ownerId)).toEqual([]);

    const { projectId } = await createProject(ownerId, draft({ projectTitle: " 海豚計畫 ", screenplayTitle: " 海豚公寓\n" }));
    const contents = await projectContents((await authorizeProjectForUser(ownerId, projectId))!);
    expect([contents.title, contents.screenplayTitle]).toEqual(["海豚計畫", "海豚公寓"]);
  });

  it("儀表板：卡片帶專案名稱、劇本名稱、最後編輯；最近編輯的在前", async () => {
    const ownerId = await newUser();
    const older = await createProject(ownerId, draft({ projectTitle: "先建的", screenplayTitle: "先建的" }));
    const newer = await createProject(ownerId, draft({ projectTitle: "後建的", screenplayTitle: "另一個名字" }));

    // 先建的那個後來又被改過：故事大綱存了一次。
    const project = (await authorizeProjectForUser(ownerId, older.projectId))!;
    const outline = await openSubmissionOutline(project);
    await saveDocument({ unit: project, documentId: outline.documentId, body: prose("改過"), token: outline.token });

    const cards = await ownedProjects(ownerId);

    expect(cards.map(({ title, screenplayTitle }) => [title, screenplayTitle])).toEqual([
      ["先建的", "先建的"],
      ["後建的", "另一個名字"],
    ]);
    expect(cards[0]!.lastEditedAt.getTime()).toBeGreaterThan(cards[1]!.lastEditedAt.getTime());
    expect(cards[1]!.projectId).toBe(newer.projectId);
  });

  it("儀表板：刪掉的自由文件不算最後編輯", async () => {
    const ownerId = await newUser();
    const first = await createProject(ownerId, draft({ projectTitle: "甲" }));
    await createProject(ownerId, draft({ projectTitle: "乙" }));

    // 甲新增一份自由文件又刪掉：它的時間比乙新，但已經不在了。
    const project = (await authorizeProjectForUser(ownerId, first.projectId))!;
    const free = await createFreeDocument(project, {});
    await deleteDocument(project, free.documentId);

    expect((await ownedProjects(ownerId)).map(({ title }) => title)).toEqual(["乙", "甲"]);
  });
  /** 儀表板上這一張卡現在的樣子。 */
  const cardOf = async (ownerId: string, projectId: string) =>
    (await ownedProjects(ownerId)).find((card) => card.projectId === projectId)!;

  it("封存與取消封存：卡片帶著封存時刻；專案照常打得開（票券 72）", async () => {
    const ownerId = await newUser();
    const { projectId } = await createProject(ownerId, draft());
    const project = (await authorizeProjectForUser(ownerId, projectId))!;

    await archiveProject(project);
    expect((await cardOf(ownerId, projectId)).archivedAt).toBeInstanceOf(Date);
    expect(await authorizeProjectForUser(ownerId, projectId)).not.toBeNull();
    expect((await projectContents(project)).archived).toBe(true);

    await unarchiveProject(project);
    expect((await cardOf(ownerId, projectId)).archivedAt).toBeNull();
  });

  it("刪除之後打不開、卡片帶著刪除時刻；還原後回來，沒封存的仍是沒封存（票券 72）", async () => {
    const ownerId = await newUser();
    const { projectId } = await createProject(ownerId, draft());

    await deleteProject((await authorizeProjectForUser(ownerId, projectId))!);
    expect(await authorizeProjectForUser(ownerId, projectId)).toBeNull();
    expect((await cardOf(ownerId, projectId)).deletedAt).toBeInstanceOf(Date);

    await restoreProject((await authorizeDeletedProjectForUser(ownerId, projectId))!);
    expect(await authorizeProjectForUser(ownerId, projectId)).not.toBeNull();
    expect(await cardOf(ownerId, projectId)).toMatchObject({ deletedAt: null, archivedAt: null });
  });

  it("已封存的專案刪掉再還原，回到的仍是已封存（票券 72）", async () => {
    const ownerId = await newUser();
    const { projectId } = await createProject(ownerId, draft());
    const project = (await authorizeProjectForUser(ownerId, projectId))!;

    await archiveProject(project);
    await deleteProject(project);
    await restoreProject((await authorizeDeletedProjectForUser(ownerId, projectId))!);

    expect(await cardOf(ownerId, projectId)).toMatchObject({ deletedAt: null, archivedAt: expect.any(Date) });
  });

  it("卡片帶著生效中的分享連結數：活的與凍結的都算，撤銷的不算（票券 72，刪除前要不要確認）", async () => {
    const ownerId = await newUser();
    const { projectId, screenplayId } = await createProject(ownerId, draft());
    expect((await cardOf(ownerId, projectId)).liveShareLinks).toBe(0);

    const screenplay = (await authorizeScreenplayForUser(ownerId, screenplayId))!;
    const live = await shareLive(screenplay);
    const delivery = await createDelivery(screenplay);
    await shareDelivery(screenplay, delivery!.deliveryId);
    await revokeShareLinks(screenplay, [live.shareId]);
    await shareLive(screenplay); // 撤銷之後重新鑄的那一條

    expect((await cardOf(ownerId, projectId)).liveShareLinks).toBe(2);
  });
  it("排程永久刪除超過 30 天的專案，劇本、交付、分享連結一起消失；不到 30 天的與沒刪的不動（票券 72）", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const ownerId = await newUser();
    const expired = await createProject(ownerId, draft({ projectTitle: "過期" }));
    const recent = await createProject(ownerId, draft({ projectTitle: "還在期限內" }));
    const alive = await createProject(ownerId, draft({ projectTitle: "沒刪" }));

    const screenplay = (await authorizeScreenplayForUser(ownerId, expired.screenplayId))!;
    const delivery = await createDelivery(screenplay);
    await shareDelivery(screenplay, delivery!.deliveryId);
    await shareLive(screenplay);

    for (const [{ projectId }, daysAgo] of [
      [expired, 31],
      [recent, 29],
    ] as const) {
      await deleteProject((await authorizeProjectForUser(ownerId, projectId))!);
      await getDb()
        .update(projects)
        .set({ deletedAt: new Date(now.getTime() - daysAgo * DAY) })
        .where(eq(projects.id, projectId));
    }

    expect(await purgeDeletedProjects(projectPurgeCutoff(now))).toBeGreaterThanOrEqual(1);

    expect((await ownedProjects(ownerId)).map(({ projectId }) => projectId).sort()).toEqual(
      [recent.projectId, alive.projectId].sort(),
    );
    // cascade 是唯一的實作手段 —— 它真的有接上。交付是唯一刻意不可變的表，這裡是它第一次跟著消失（ADR-0008〈收回〉）。
    const { screenplayId } = expired;
    expect(await getDb().select().from(screenplays).where(eq(screenplays.id, screenplayId))).toEqual([]);
    expect(await getDb().select().from(deliveries).where(eq(deliveries.screenplayId, screenplayId))).toEqual([]);
    expect(await getDb().select().from(shareLinks).where(eq(shareLinks.screenplayId, screenplayId))).toEqual([]);
  });
});
