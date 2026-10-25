import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { getDb } from "@/db/client";

/**
 * 遷移 0010（票券 71）：劇本長出自己的名稱，**既有劇本回填成它所屬專案的名稱**，之後才加 NOT NULL。
 *
 * 跑的是**遷移檔本身**，不是重寫一份等價的 SQL —— 回填那一句改壞了，這裡要知道。為了不碰真正的資料表，
 * 在一個用完即丟的 schema 裡擺出 0010 之前那幾欄（只擺遷移碰得到的），把 search_path 指過去再執行；
 * 整段在一個交易裡、最後 rollback —— Postgres 的 DDL 也退得回去，什麼都不留下。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const MIGRATION = join(__dirname, "../../drizzle/0010_screenplay_title_and_creation_id.sql");
const SCRATCH = `migration_0010_${Date.now()}`;

type Outcome = { rows: { id: string; title: string }[]; nullable: string };

/** 在 0010 之前的那幾張表上跑一次遷移，回報劇本名稱長什麼樣子；跑完整段退回去。 */
async function migrateScratch(): Promise<Outcome | undefined> {
  const statements = readFileSync(MIGRATION, "utf8").split("--> statement-breakpoint");
  let outcome: Outcome | undefined;
  try {
    await getDb().transaction(async (tx) => {
      const run = (statement: string) => tx.execute(sql.raw(statement));
      await run(`create schema "${SCRATCH}"`);
      await run(`set local search_path to "${SCRATCH}"`);
      await run(`create table projects (id text primary key, owner_id text not null, title text not null)`);
      await run(`create table screenplays (id text primary key, project_id text not null references projects (id))`);
      await run(`insert into projects values ('pj_a', 'usr_x', '海豚計畫'), ('pj_b', 'usr_x', '河堤上的十分鐘')`);
      await run(`insert into screenplays values ('sp_a', 'pj_a'), ('sp_b', 'pj_b')`);

      for (const statement of statements) await run(statement);

      const rows = await tx.execute<{ id: string; title: string }>(sql.raw(`select id, title from screenplays order by id`));
      const [column] = await tx.execute<{ nullable: string }>(
        sql.raw(
          `select is_nullable as nullable from information_schema.columns
           where table_schema = '${SCRATCH}' and table_name = 'screenplays' and column_name = 'title'`,
        ),
      );
      outcome = { rows: [...rows], nullable: column?.nullable ?? "" };
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  return outcome;
}

describe.skipIf(!hasDatabase)("遷移 0010：劇本名稱回填（需要 Postgres）", () => {
  it("既有劇本的劇本名稱等於它所屬專案的名稱，之後不能是空的", async () => {
    const outcome = await migrateScratch();

    expect(outcome?.rows).toEqual([
      { id: "sp_a", title: "海豚計畫" },
      { id: "sp_b", title: "河堤上的十分鐘" },
    ]);
    expect(outcome?.nullable).toBe("NO");
  });
});
