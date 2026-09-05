import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { mintId } from "@scenephonie/schema";

import {
  authorizeProjectForUser,
  authorizeScreenplayForUser,
  type AuthorizedProject,
  type AuthorizedScreenplay,
} from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, screenplayBackups, screenplays, users } from "@/db/schema";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import { BACKUP_INTERVAL_MS } from "./backup-policy";
import {
  CURRENT_DOC_SCHEMA_VERSION,
  __installMigrationForTest,
  type PersistedDoc,
} from "./doc-schema-version";
import { encodeSaveToken, type SaveToken } from "./save-token";
import {
  createScreenplay,
  loadScreenplay,
  saveScreenplay,
  type SaveResult,
} from "./screenplay-store";

/**
 * persistence 的真實行為 —— 並行、遷移、備份、交易邊界都只在真的 Postgres 上才成立，
 * 所以這一組不用替身（§6.7）。
 *
 * 沒有 `DATABASE_URL` 就整組跳過：本機 `docker compose up -d db` 之後才跑得到；
 * CI 起了 postgres service，所以在 CI 一定會跑。
 *
 * ⚠️ 票券 06 之後，這個模組的每一支都只吃**已授權的 handle**（不變式 H）。所以這一組
 * 先開一個真的 owner 與一個真的專案，handle 一律**從 gate 手上拿**而不是就地捏一個 ——
 * 測試裡捏得出來的東西，正式程式碼裡遲早也捏得出來。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** 斷言存檔成功並取出下一個 token —— union 的收窄與斷言一次做完。 */
const tokenAfterSave = (result: SaveResult): SaveToken => {
  if (result.status !== "saved") throw new Error("預期這次存檔成功，實際是 conflict");
  return result.token;
};

const docWith = (marker: string): PersistedDoc => ({
  type: "doc",
  content: [
    {
      type: "scene",
      attrs: { sceneId: `sc_${marker}` },
      content: [{ type: "action", content: [{ type: "text", text: marker }] }],
    },
  ],
});

describe.skipIf(!hasDatabase)("screenplay store（需要 Postgres）", () => {
  const created: string[] = [];
  const ownerId = mintId(USER_ID_PREFIX);
  let project: AuthorizedProject;

  const track = <T extends { screenplayId: string }>(loaded: T): T => {
    created.push(loaded.screenplayId);
    return loaded;
  };

  /** 這份劇本的 handle —— 走 gate，不自己捏。 */
  const authorized = async (screenplayId: string): Promise<AuthorizedScreenplay> => {
    const handle = await authorizeScreenplayForUser(ownerId, screenplayId);
    if (!handle) throw new Error(`gate 不認得 ${screenplayId}`);
    return handle;
  };

  beforeAll(async () => {
    // 表在不在 —— 沒跑過 migration 的話與其讓斷言神祕失敗，不如當場說清楚。
    await getDb().execute(sql`select 1 from ${screenplays} limit 1`);

    await getDb()
      .insert(users)
      .values({ id: ownerId, name: "測試", email: `${ownerId}@example.test` });
    const projectId = mintId(PROJECT_ID_PREFIX);
    await getDb()
      .insert(projects)
      .values({ id: projectId, type: SINGLE_SCREENPLAY_PROJECT, title: "測試專案", ownerId });
    const granted = await authorizeProjectForUser(ownerId, projectId);
    if (!granted) throw new Error("剛建立的專案卻過不了 gate");
    project = granted;
  });

  afterAll(async () => {
    // 專案與劇本隨 owner 的 FK cascade 一起走。
    await getDb().delete(users).where(eq(users.id, ownerId));
  });

  afterEach(async () => {
    for (const id of created.splice(0)) {
      await getDb().delete(screenplays).where(eq(screenplays.id, id));
    }
  });

  it("存了就載得回來 —— 重整頁面內容還在", async () => {
    const fresh = track(await createScreenplay(project, docWith("first")));

    const saved = await saveScreenplay({
      screenplay: await authorized(fresh.screenplayId),
      doc: docWith("second"),
      token: fresh.token,
    });
    expect(saved.status).toBe("saved");

    const reloaded = await loadScreenplay(await authorized(fresh.screenplayId));
    expect(reloaded?.doc).toEqual(docWith("second"));
  });

  // 「不存在的劇本載回 null」這個案例搬去了 authorization/gate.integration.test.ts：
  // 票券 06 之後不存在的劇本根本拿不到 handle，這裡進不去。`loadScreenplay` 仍會回 null
  // （handle 到手與查詢之間那一瞬被刪掉），但那條路測不出來，也不值得為它偽造一個 handle。

  it("回報這一份是剛開的還是撈回來的", async () => {
    const fresh = track(await createScreenplay(project, docWith("origin")));
    expect(fresh.origin).toBe("created");
    expect((await loadScreenplay(await authorized(fresh.screenplayId)))?.origin).toBe("loaded");
  });

  it("兩個分頁拿同一份存檔：第二個被拒，第一個寫的內容不被覆蓋", async () => {
    const fresh = track(await createScreenplay(project, docWith("base")));

    const tabA = await loadScreenplay(await authorized(fresh.screenplayId));
    const tabB = await loadScreenplay(await authorized(fresh.screenplayId));

    const first = await saveScreenplay({
      screenplay: await authorized(fresh.screenplayId),
      doc: docWith("tabA"),
      token: tabA!.token,
    });
    const second = await saveScreenplay({
      screenplay: await authorized(fresh.screenplayId),
      doc: docWith("tabB"),
      token: tabB!.token,
    });

    expect(first.status).toBe("saved");
    expect(second.status).toBe("conflict");
    expect((await loadScreenplay(await authorized(fresh.screenplayId)))?.doc).toEqual(docWith("tabA"));
  });

  it("兩次存檔同時飛出去：恰好一次成功", async () => {
    const fresh = track(await createScreenplay(project, docWith("base")));

    // handle 先拿好 —— 兩次存檔要真的同時飛出去，中間不能夾一次 gate 查詢。
    const handle = await authorized(fresh.screenplayId);
    const results = await Promise.all([
      saveScreenplay({ screenplay: handle, doc: docWith("a"), token: fresh.token }),
      saveScreenplay({ screenplay: handle, doc: docWith("b"), token: fresh.token }),
    ]);

    expect(results.filter((r) => r.status === "saved")).toHaveLength(1);
    expect(results.filter((r) => r.status === "conflict")).toHaveLength(1);
  });

  it("竄改過的 token 存不進去", async () => {
    const fresh = track(await createScreenplay(project, docWith("base")));

    const result = await saveScreenplay({
      screenplay: await authorized(fresh.screenplayId),
      doc: docWith("forged"),
      token: "st_" as SaveToken,
    });

    expect(result.status).toBe("conflict");
    expect((await loadScreenplay(await authorized(fresh.screenplayId)))?.doc).toEqual(docWith("base"));
  });

  describe("舊版 doc", () => {
    const OLD_VERSION = CURRENT_DOC_SCHEMA_VERSION - 1;
    let restoreMigration: (() => void) | undefined;

    const seedOldVersionRow = async (): Promise<string> => {
      const fresh = track(await createScreenplay(project, docWith("old")));
      await getDb()
        .update(screenplays)
        .set({ docSchemaVersion: OLD_VERSION })
        .where(eq(screenplays.id, fresh.screenplayId));
      return fresh.screenplayId;
    };

    beforeAll(() => {
      restoreMigration = __installMigrationForTest(OLD_VERSION, (doc) => ({
        ...doc,
        migratedInMemory: true,
      }));
      return () => restoreMigration?.();
    });

    it("載入時在記憶體遷移，資料庫一個字都不動（讀取路徑不寫回）", async () => {
      const screenplayId = await seedOldVersionRow();

      const loaded = await loadScreenplay(await authorized(screenplayId));
      expect(loaded?.doc).toMatchObject({ migratedInMemory: true });

      const [row] = await getDb()
        .select({ docSchemaVersion: screenplays.docSchemaVersion, docSeq: screenplays.docSeq })
        .from(screenplays)
        .where(eq(screenplays.id, screenplayId));
      expect(row).toEqual({ docSchemaVersion: OLD_VERSION, docSeq: 0 });

      // 讀了幾次都一樣 —— PDF／場次表／分享連結走這條路都不會寫資料庫。
      await loadScreenplay(await authorized(screenplayId));
      await loadScreenplay(await authorized(screenplayId));
      const [again] = await getDb()
        .select({ docSchemaVersion: screenplays.docSchemaVersion, docSeq: screenplays.docSeq })
        .from(screenplays)
        .where(eq(screenplays.id, screenplayId));
      expect(again).toEqual({ docSchemaVersion: OLD_VERSION, docSeq: 0 });
    });

    it("寫回只發生在存檔路徑，且遷移、doc、並行 token 同一交易一起前進", async () => {
      const screenplayId = await seedOldVersionRow();
      const loaded = await loadScreenplay(await authorized(screenplayId));

      const result = await saveScreenplay({
        screenplay: await authorized(screenplayId),
        doc: docWith("new"),
        token: loaded!.token,
      });
      expect(result.status).toBe("saved");

      const [row] = await getDb()
        .select({
          doc: screenplays.doc,
          docSchemaVersion: screenplays.docSchemaVersion,
          docSeq: screenplays.docSeq,
        })
        .from(screenplays)
        .where(eq(screenplays.id, screenplayId));
      expect(row).toEqual({
        doc: docWith("new"),
        docSchemaVersion: CURRENT_DOC_SCHEMA_VERSION,
        docSeq: 1,
      });
    });
  });

  describe("自動備份", () => {
    const backupsOf = async (screenplayId: string) =>
      getDb()
        .select({ doc: screenplayBackups.doc, createdAt: screenplayBackups.createdAt })
        .from(screenplayBackups)
        .where(eq(screenplayBackups.screenplayId, screenplayId));

    const ageBackups = async (screenplayId: string, ms: number) => {
      await getDb()
        .update(screenplayBackups)
        .set({ createdAt: new Date(Date.now() - ms) })
        .where(eq(screenplayBackups.screenplayId, screenplayId));
    };

    it("第一次存檔就留下 before-image；兩小時內的後續存檔不再寫", async () => {
      const fresh = track(await createScreenplay(project, docWith("base")));

      const first = await saveScreenplay({
        screenplay: await authorized(fresh.screenplayId),
        doc: docWith("v2"),
        token: fresh.token,
      });
      expect(first.status).toBe("saved");

      const afterFirst = await backupsOf(fresh.screenplayId);
      expect(afterFirst).toHaveLength(1);
      // 存的是被覆蓋掉的那一份，不是剛存進去的那一份。
      expect(afterFirst[0]!.doc).toEqual(docWith("base"));

      const second = await saveScreenplay({
        screenplay: await authorized(fresh.screenplayId),
        doc: docWith("v3"),
        token: tokenAfterSave(first),
      });
      expect(second.status).toBe("saved");
      expect(await backupsOf(fresh.screenplayId)).toHaveLength(1);
    });

    it("距上一筆備份滿兩小時的那次存檔，先寫一筆", async () => {
      const fresh = track(await createScreenplay(project, docWith("base")));

      const first = await saveScreenplay({
        screenplay: await authorized(fresh.screenplayId),
        doc: docWith("v2"),
        token: fresh.token,
      });
      await ageBackups(fresh.screenplayId, BACKUP_INTERVAL_MS + 60_000);

      const second = await saveScreenplay({
        screenplay: await authorized(fresh.screenplayId),
        doc: docWith("v3"),
        token: tokenAfterSave(first),
      });
      expect(second.status).toBe("saved");

      const backups = await backupsOf(fresh.screenplayId);
      expect(backups).toHaveLength(2);
      expect(backups.map((b) => b.doc)).toContainEqual(docWith("v2"));
    });

    it("被拒的存檔不留下備份 —— 備份與 canonical update 是同一個 atomic transition", async () => {
      const fresh = track(await createScreenplay(project, docWith("base")));

      const rejected = await saveScreenplay({
        screenplay: await authorized(fresh.screenplayId),
        doc: docWith("stale"),
        token: encodeSaveToken(99),
      });

      expect(rejected.status).toBe("conflict");
      expect(await backupsOf(fresh.screenplayId)).toHaveLength(0);
    });
  });
});
