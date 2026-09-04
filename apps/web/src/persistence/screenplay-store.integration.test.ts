import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db/client";
import { screenplayBackups, screenplays } from "@/db/schema";

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

  const track = <T extends { screenplayId: string }>(loaded: T): T => {
    created.push(loaded.screenplayId);
    return loaded;
  };

  beforeAll(async () => {
    // 表在不在 —— 沒跑過 migration 的話與其讓斷言神祕失敗，不如當場說清楚。
    await getDb().execute(sql`select 1 from ${screenplays} limit 1`);
  });

  afterEach(async () => {
    for (const id of created.splice(0)) {
      await getDb().delete(screenplays).where(eq(screenplays.id, id));
    }
  });

  it("存了就載得回來 —— 重整頁面內容還在", async () => {
    const fresh = track(await createScreenplay(docWith("first")));

    const saved = await saveScreenplay({
      screenplayId: fresh.screenplayId,
      doc: docWith("second"),
      token: fresh.token,
    });
    expect(saved.status).toBe("saved");

    const reloaded = await loadScreenplay(fresh.screenplayId);
    expect(reloaded?.doc).toEqual(docWith("second"));
  });

  it("不存在的劇本載回 null", async () => {
    expect(await loadScreenplay("sp_不存在")).toBeNull();
  });

  it("兩個分頁拿同一份存檔：第二個被拒，第一個寫的內容不被覆蓋", async () => {
    const fresh = track(await createScreenplay(docWith("base")));

    const tabA = await loadScreenplay(fresh.screenplayId);
    const tabB = await loadScreenplay(fresh.screenplayId);

    const first = await saveScreenplay({
      screenplayId: fresh.screenplayId,
      doc: docWith("tabA"),
      token: tabA!.token,
    });
    const second = await saveScreenplay({
      screenplayId: fresh.screenplayId,
      doc: docWith("tabB"),
      token: tabB!.token,
    });

    expect(first.status).toBe("saved");
    expect(second.status).toBe("conflict");
    expect((await loadScreenplay(fresh.screenplayId))?.doc).toEqual(docWith("tabA"));
  });

  it("兩次存檔同時飛出去：恰好一次成功", async () => {
    const fresh = track(await createScreenplay(docWith("base")));

    const results = await Promise.all([
      saveScreenplay({ screenplayId: fresh.screenplayId, doc: docWith("a"), token: fresh.token }),
      saveScreenplay({ screenplayId: fresh.screenplayId, doc: docWith("b"), token: fresh.token }),
    ]);

    expect(results.filter((r) => r.status === "saved")).toHaveLength(1);
    expect(results.filter((r) => r.status === "conflict")).toHaveLength(1);
  });

  it("竄改過的 token 存不進去", async () => {
    const fresh = track(await createScreenplay(docWith("base")));

    const result = await saveScreenplay({
      screenplayId: fresh.screenplayId,
      doc: docWith("forged"),
      token: "st_" as SaveToken,
    });

    expect(result.status).toBe("conflict");
    expect((await loadScreenplay(fresh.screenplayId))?.doc).toEqual(docWith("base"));
  });

  describe("舊版 doc", () => {
    const OLD_VERSION = CURRENT_DOC_SCHEMA_VERSION - 1;
    let restoreMigration: (() => void) | undefined;

    const seedOldVersionRow = async (): Promise<string> => {
      const fresh = track(await createScreenplay(docWith("old")));
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

      const loaded = await loadScreenplay(screenplayId);
      expect(loaded?.doc).toMatchObject({ migratedInMemory: true });

      const [row] = await getDb()
        .select({ docSchemaVersion: screenplays.docSchemaVersion, docSeq: screenplays.docSeq })
        .from(screenplays)
        .where(eq(screenplays.id, screenplayId));
      expect(row).toEqual({ docSchemaVersion: OLD_VERSION, docSeq: 0 });

      // 讀了幾次都一樣 —— PDF／場次表／分享連結走這條路都不會寫資料庫。
      await loadScreenplay(screenplayId);
      await loadScreenplay(screenplayId);
      const [again] = await getDb()
        .select({ docSchemaVersion: screenplays.docSchemaVersion, docSeq: screenplays.docSeq })
        .from(screenplays)
        .where(eq(screenplays.id, screenplayId));
      expect(again).toEqual({ docSchemaVersion: OLD_VERSION, docSeq: 0 });
    });

    it("寫回只發生在存檔路徑，且遷移、doc、並行 token 同一交易一起前進", async () => {
      const screenplayId = await seedOldVersionRow();
      const loaded = await loadScreenplay(screenplayId);

      const result = await saveScreenplay({
        screenplayId,
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
      const fresh = track(await createScreenplay(docWith("base")));

      const first = await saveScreenplay({
        screenplayId: fresh.screenplayId,
        doc: docWith("v2"),
        token: fresh.token,
      });
      expect(first.status).toBe("saved");

      const afterFirst = await backupsOf(fresh.screenplayId);
      expect(afterFirst).toHaveLength(1);
      // 存的是被覆蓋掉的那一份，不是剛存進去的那一份。
      expect(afterFirst[0]!.doc).toEqual(docWith("base"));

      const second = await saveScreenplay({
        screenplayId: fresh.screenplayId,
        doc: docWith("v3"),
        token: tokenAfterSave(first),
      });
      expect(second.status).toBe("saved");
      expect(await backupsOf(fresh.screenplayId)).toHaveLength(1);
    });

    it("距上一筆備份滿兩小時的那次存檔，先寫一筆", async () => {
      const fresh = track(await createScreenplay(docWith("base")));

      const first = await saveScreenplay({
        screenplayId: fresh.screenplayId,
        doc: docWith("v2"),
        token: fresh.token,
      });
      await ageBackups(fresh.screenplayId, BACKUP_INTERVAL_MS + 60_000);

      const second = await saveScreenplay({
        screenplayId: fresh.screenplayId,
        doc: docWith("v3"),
        token: tokenAfterSave(first),
      });
      expect(second.status).toBe("saved");

      const backups = await backupsOf(fresh.screenplayId);
      expect(backups).toHaveLength(2);
      expect(backups.map((b) => b.doc)).toContainEqual(docWith("v2"));
    });

    it("被拒的存檔不留下備份 —— 備份與 canonical update 是同一個 atomic transition", async () => {
      const fresh = track(await createScreenplay(docWith("base")));

      const rejected = await saveScreenplay({
        screenplayId: fresh.screenplayId,
        doc: docWith("stale"),
        token: encodeSaveToken(99),
      });

      expect(rejected.status).toBe("conflict");
      expect(await backupsOf(fresh.screenplayId)).toHaveLength(0);
    });
  });
});
