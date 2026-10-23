import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintId, type DocumentKind } from "@scenephonie/schema";

import {
  authorizeProjectForUser,
  authorizeScreenplayForUser,
  type AuthorizedProject,
  type AuthorizedScreenplay,
} from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { documents, projects, users } from "@/db/schema";
import { emptyScreenplay } from "@/editor/empty-screenplay";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import {
  CURRENT_DOCUMENT_SCHEMA_VERSIONS,
  __installDocumentMigrationForTest,
} from "./document-schema-version";
import {
  createFreeDocument,
  deleteDocument,
  listDocuments,
  loadDocument,
  openSceneOutline,
  openSubmissionOutline,
  purgeDeletedDocuments,
  renameDocument,
  restoreDocument,
  saveDocument,
  type DocumentSaveResult,
} from "./document-store";
import type { PersistedDoc } from "./doc-schema-version";
import { createScreenplay } from "./screenplay-store";
import type { SaveToken } from "./save-token";

/**
 * 劇本外文件的真實行為（票券 21）—— 不變式 F、並行、遷移鏈都要真的 Postgres 才成立。
 * 沒有 `DATABASE_URL` 就整組跳過（同 `screenplay-store.integration.test.ts`）。
 *
 * handle 一律從 gate 拿 —— 測試裡捏得出來的東西，正式程式碼裡遲早也捏得出來。唯一的例外是
 * 「型別擋住了、執行期也要擋」那一條：它要的就是一個型別上表示不出來的呼叫。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const prose = (text: string): PersistedDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const tokenAfterSave = (result: DocumentSaveResult): SaveToken => {
  if (result.status !== "saved") throw new Error(`預期這次存檔成功，實際是 ${result.status}`);
  return result.token;
};

describe.skipIf(!hasDatabase)("document store（需要 Postgres）", () => {
  const ownerId = mintId(USER_ID_PREFIX);
  const strangerId = mintId(USER_ID_PREFIX);
  let project: AuthorizedProject;
  let screenplay: AuthorizedScreenplay;
  let strangerProject: AuthorizedProject;

  /** 開一個人、一個專案、一份劇本，handle 從 gate 拿。 */
  const seed = async (userId: string) => {
    await getDb().insert(users).values({ id: userId, name: "測試", email: `${userId}@example.test` });
    const projectId = mintId(PROJECT_ID_PREFIX);
    await getDb().insert(projects).values({ id: projectId, type: SINGLE_SCREENPLAY_PROJECT, title: "測試專案", ownerId: userId });
    const granted = await authorizeProjectForUser(userId, projectId);
    if (!granted) throw new Error("剛建立的專案卻過不了 gate");
    const { screenplayId } = await createScreenplay(granted, emptyScreenplay());
    const script = await authorizeScreenplayForUser(userId, screenplayId);
    if (!script) throw new Error("剛建立的劇本卻過不了 gate");
    return { project: granted, screenplay: script };
  };

  beforeAll(async () => {
    await getDb().execute(sql`select 1 from ${documents} limit 1`);
    ({ project, screenplay } = await seed(ownerId));
    ({ project: strangerProject } = await seed(strangerId));
  });

  afterAll(async () => {
    // 專案、劇本、文件隨 owner 的 FK cascade 一起走。
    await getDb().delete(users).where(eq(users.id, ownerId));
    await getDb().delete(users).where(eq(users.id, strangerId));
  });

  it("交件大綱存了就載得回來", async () => {
    const outline = await openSubmissionOutline(project);
    expect(outline).toMatchObject({ kind: "交件大綱", title: null });

    tokenAfterSave(await saveDocument({ unit: project, documentId: outline.documentId, body: prose("一個雨夜"), token: outline.token }));

    const reloaded = await loadDocument(project, outline.documentId);
    expect(reloaded?.body).toEqual(prose("一個雨夜"));
  });

  it("自由文件可以有好幾份，各自命名，早建立的在前", async () => {
    const a = await createFreeDocument(project, { title: "世界觀" });
    const b = await createFreeDocument(project, { title: "高雄拍 500 字版" });

    const listed = await listDocuments(project);
    expect(listed.filter((d) => d.documentId === a.documentId || d.documentId === b.documentId).map((d) => d.title)).toEqual([
      "世界觀",
      "高雄拍 500 字版",
    ]);
  });

  it("自由文件改名只改名字，不動內文", async () => {
    const created = await createFreeDocument(project, { title: "筆記" });
    expect(await renameDocument(project, created.documentId, "研究筆記")).toBe(true);

    const reloaded = await loadDocument(project, created.documentId);
    expect(reloaded).toMatchObject({ title: "研究筆記", body: created.body });
  });

  it("名字清空 ＝ 沒命名（不存一個空字串）", async () => {
    const created = await createFreeDocument(project, { title: "筆記" });
    await renameDocument(project, created.documentId, "   ");
    expect((await loadDocument(project, created.documentId))?.title).toBeNull();
  });

  it("固定文件不能改名：名字就是它是什麼", async () => {
    const outline = await openSubmissionOutline(project);
    expect(await renameDocument(project, outline.documentId, "劇情大綱")).toBe(false);
    expect((await loadDocument(project, outline.documentId))?.title).toBeNull();
  });

  describe("交件大綱一個專案一份", () => {
    it("打開兩次拿到同一份", async () => {
      const first = await openSubmissionOutline(project);
      const second = await openSubmissionOutline(project);
      expect(second.documentId).toBe(first.documentId);
    });

    it("兩個分頁同時第一次打開：還是只有一份", async () => {
      const fresh = await seed(mintId(USER_ID_PREFIX));
      try {
        const [a, b] = await Promise.all([openSubmissionOutline(fresh.project), openSubmissionOutline(fresh.project)]);
        expect(a.documentId).toBe(b.documentId);
      } finally {
        await getDb().delete(users).where(eq(users.id, fresh.project.ownerId));
      }
    });
  });

  describe("刪除自由文件：當下就不見，復原得回來，排程才真的清掉", () => {
    it("刪了之後清單沒有、讀不到、存不進去", async () => {
      const doc = await createFreeDocument(project, { title: "要刪的" });
      expect(await deleteDocument(project, doc.documentId)).toBe(true);

      expect((await listDocuments(project)).map((d) => d.documentId)).not.toContain(doc.documentId);
      expect(await loadDocument(project, doc.documentId)).toBeNull();
      expect((await saveDocument({ unit: project, documentId: doc.documentId, body: prose("x"), token: doc.token })).status).toBe(
        "conflict",
      );
    });

    it("復原之後內容原封不動地回來", async () => {
      const doc = await createFreeDocument(project, { title: "誤刪" });
      const saved = tokenAfterSave(
        await saveDocument({ unit: project, documentId: doc.documentId, body: prose("寫了一半"), token: doc.token }),
      );
      await deleteDocument(project, doc.documentId);

      expect(await restoreDocument(project, doc.documentId)).toBe(true);
      expect(await loadDocument(project, doc.documentId)).toMatchObject({ title: "誤刪", body: prose("寫了一半"), token: saved });
    });

    it("固定文件刪不掉", async () => {
      const outline = await openSubmissionOutline(project);
      const sceneOutline = await openSceneOutline(screenplay);
      expect(await deleteDocument(project, outline.documentId)).toBe(false);
      expect(await deleteDocument(project, sceneOutline.documentId)).toBe(false);
      expect(await loadDocument(project, outline.documentId)).not.toBeNull();
    });

    it("別人的文件刪不掉、也復原不了", async () => {
      const doc = await createFreeDocument(project, { title: "我的" });
      expect(await deleteDocument(strangerProject, doc.documentId)).toBe(false);
      await deleteDocument(project, doc.documentId);
      expect(await restoreDocument(strangerProject, doc.documentId)).toBe(false);
      expect(await restoreDocument(project, doc.documentId)).toBe(true);
    });

    it("排程只清掉刪除超過期限的那些", async () => {
      const old = await createFreeDocument(project, { title: "早就刪了" });
      const recent = await createFreeDocument(project, { title: "剛刪" });
      const kept = await createFreeDocument(project, { title: "沒刪" });
      await deleteDocument(project, old.documentId);
      await deleteDocument(project, recent.documentId);
      await getDb()
        .update(documents)
        .set({ deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
        .where(eq(documents.id, old.documentId));

      await purgeDeletedDocuments(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const remaining = await getDb()
        .select({ id: documents.id })
        .from(documents)
        .where(sql`${documents.id} in (${old.documentId}, ${recent.documentId}, ${kept.documentId})`);
      expect(remaining.map((row) => row.id).sort()).toEqual([recent.documentId, kept.documentId].sort());
    });
  });

  describe("不變式 F：kind 固定其合法層級", () => {
    it("交件大綱掛專案、分場大綱掛劇本 —— 寫進資料庫的就是這樣", async () => {
      const outline = await openSubmissionOutline(project);
      const sceneOutline = await openSceneOutline(screenplay);

      const rows = await getDb()
        .select({ id: documents.id, projectId: documents.projectId, screenplayId: documents.screenplayId })
        .from(documents)
        .where(sql`${documents.id} in (${outline.documentId}, ${sceneOutline.documentId})`);
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(outline.documentId)).toMatchObject({ projectId: project.projectId, screenplayId: null });
      expect(byId.get(sceneOutline.documentId)).toMatchObject({
        projectId: screenplay.projectId,
        screenplayId: screenplay.screenplayId,
      });
    });

    it("把專案層的 kind 掛到劇本上：寫入路徑拒絕（型別擋住之外，執行期也擋）", async () => {
      const wrongScope = screenplay as unknown as AuthorizedProject;
      await expect(openSubmissionOutline(wrongScope)).rejects.toThrow(/不變式 F/);
      await expect(createFreeDocument(wrongScope, {})).rejects.toThrow(/不變式 F/);
    });

    it("把劇本層的 kind 掛到專案上：寫入路徑拒絕", async () => {
      await expect(openSceneOutline(project as unknown as AuthorizedScreenplay)).rejects.toThrow(/不變式 F/);
    });

    it("繞過 persistence 直接寫進資料庫：資料層也拒絕掛錯層的那一列（§11：資料層 ＋ command）", async () => {
      const row = { kind: "分場大綱", body: {}, docSchemaVersion: 1, projectId: project.projectId };
      await expect(getDb().insert(documents).values({ ...row, id: mintId("dc_"), screenplayId: null })).rejects.toThrow();
      await expect(
        getDb()
          .insert(documents)
          .values({ ...row, id: mintId("dc_"), kind: "交件大綱", screenplayId: screenplay.screenplayId }),
      ).rejects.toThrow();
    });

    it("分場大綱從專案層讀不到（同一份文件只有一個合法位址）", async () => {
      const sceneOutline = await openSceneOutline(screenplay);
      expect(await loadDocument(project, sceneOutline.documentId)).toBeNull();
      expect(await loadDocument(screenplay, sceneOutline.documentId)).not.toBeNull();
    });

    it("交件大綱從劇本層讀不到", async () => {
      const outline = await openSubmissionOutline(project);
      expect(await loadDocument(screenplay, outline.documentId)).toBeNull();
    });
  });

  describe("授權範圍", () => {
    it("別人的文件讀不到、存不進去、改不了名", async () => {
      const outline = await createFreeDocument(project, { title: "我的" });

      expect(await loadDocument(strangerProject, outline.documentId)).toBeNull();
      expect(
        (await saveDocument({ unit: strangerProject, documentId: outline.documentId, body: prose("偷改"), token: outline.token })).status,
      ).toBe("conflict");
      expect(await renameDocument(strangerProject, outline.documentId, "偷改")).toBe(false);
      expect(await loadDocument(project, outline.documentId)).toMatchObject({ title: "我的", body: outline.body });
    });

    it("清單只列這個專案的文件", async () => {
      const mine = await createFreeDocument(project, {});
      const listed = await listDocuments(strangerProject);
      expect(listed.map((d) => d.documentId)).not.toContain(mine.documentId);
    });
  });

  describe("分場大綱一份劇本一份", () => {
    it("打開兩次拿到同一份", async () => {
      const first = await openSceneOutline(screenplay);
      const second = await openSceneOutline(screenplay);
      expect(second.documentId).toBe(first.documentId);
    });

    it("兩個分頁同時第一次打開：還是只有一份", async () => {
      const fresh = await seed(mintId(USER_ID_PREFIX));
      try {
        const [a, b] = await Promise.all([openSceneOutline(fresh.screenplay), openSceneOutline(fresh.screenplay)]);
        expect(a.documentId).toBe(b.documentId);
      } finally {
        await getDb().delete(users).where(eq(users.id, fresh.project.ownerId));
      }
    });
  });

  describe("並行", () => {
    it("兩個分頁拿同一份存檔：第二個被拒，第一個寫的不被覆蓋", async () => {
      const created = await createFreeDocument(project, {});
      const tabA = await loadDocument(project, created.documentId);
      const tabB = await loadDocument(project, created.documentId);

      const first = await saveDocument({ unit: project, documentId: created.documentId, body: prose("A"), token: tabA!.token });
      const second = await saveDocument({ unit: project, documentId: created.documentId, body: prose("B"), token: tabB!.token });

      expect(first.status).toBe("saved");
      expect(second.status).toBe("conflict");
      expect((await loadDocument(project, created.documentId))?.body).toEqual(prose("A"));
    });

    it("同一個分頁連續存：每次拿回的 token 都接得上", async () => {
      const created = await createFreeDocument(project, {});
      const t1 = tokenAfterSave(await saveDocument({ unit: project, documentId: created.documentId, body: prose("1"), token: created.token }));
      const t2 = tokenAfterSave(await saveDocument({ unit: project, documentId: created.documentId, body: prose("2"), token: t1 }));
      expect(t2).not.toBe(t1);
    });
  });

  it("存不進一份這個 kind 讀不出來的 doc（寫入邊界的 canonical 驗證）", async () => {
    const created = await createFreeDocument(project, {});
    const notProse = { type: "doc", content: [{ type: "scene", attrs: { sceneId: "sc_x" } }] };
    await expect(
      saveDocument({ unit: project, documentId: created.documentId, body: notProse, token: created.token }),
    ).rejects.toThrow();
    expect((await loadDocument(project, created.documentId))?.body).toEqual(created.body);
  });

  describe("每個 kind 有自己的遷移鏈", () => {
    const seedOld = async (kind: DocumentKind, documentId: string) => {
      await getDb()
        .update(documents)
        .set({ docSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSIONS[kind] - 1 })
        .where(eq(documents.id, documentId));
    };

    it("自由文件的遷移只作用在自由文件上；載入時在記憶體遷移，資料庫不動", async () => {
      const restore = __installDocumentMigrationForTest("自由文件", CURRENT_DOCUMENT_SCHEMA_VERSIONS["自由文件"] - 1, (doc) => ({
        ...doc,
        content: [{ type: "paragraph", content: [{ type: "text", text: "遷移過" }] }],
      }));
      try {
        const outline = await createFreeDocument(project, {});
        await seedOld("自由文件", outline.documentId);
        expect((await loadDocument(project, outline.documentId))?.body).toEqual(prose("遷移過"));

        const [row] = await getDb().select({ body: documents.body }).from(documents).where(eq(documents.id, outline.documentId));
        expect(row?.body).toEqual(outline.body);

        // 分場大綱停在舊版號時，自由文件那一節不會被拿來用 —— 它的鏈缺一節，大聲失敗。
        const sceneOutline = await openSceneOutline(screenplay);
        await seedOld("分場大綱", sceneOutline.documentId);
        await expect(loadDocument(screenplay, sceneOutline.documentId)).rejects.toThrow(/分場大綱/);
        await getDb()
          .update(documents)
          .set({ docSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSIONS["分場大綱"] })
          .where(eq(documents.id, sceneOutline.documentId));
      } finally {
        restore();
      }
    });

    it("存檔把那一列帶到該 kind 的現行版本", async () => {
      const restore = __installDocumentMigrationForTest("自由文件", CURRENT_DOCUMENT_SCHEMA_VERSIONS["自由文件"] - 1, (doc) => doc);
      try {
        const outline = await createFreeDocument(project, {});
        await seedOld("自由文件", outline.documentId);
        const loaded = await loadDocument(project, outline.documentId);
        tokenAfterSave(await saveDocument({ unit: project, documentId: outline.documentId, body: prose("新"), token: loaded!.token }));

        const [row] = await getDb()
          .select({ version: documents.docSchemaVersion })
          .from(documents)
          .where(eq(documents.id, outline.documentId));
        expect(row?.version).toBe(CURRENT_DOCUMENT_SCHEMA_VERSIONS["自由文件"]);
      } finally {
        restore();
      }
    });
  });
});
