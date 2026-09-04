import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { mintId } from "@scenephonie/schema";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { screenplays, users } from "@/db/schema";

import { landingProject, ownedProjects, projectContents } from "./project-store";

/**
 * 登入後的落點是**一次 GET 上的寫入**，所以它必須冪等 —— 第一次登入時的重試、prefetch
 * 或兩個分頁會同時走到這裡，而 v1 沒有刪專案這件事：清不掉的東西不能靠「應該不會同時
 * 發生」來防。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("登入後的落點（需要 Postgres）", () => {
  const db = getDb();
  const createdUsers: string[] = [];

  const newUser = async (): Promise<string> => {
    const id = mintId(USER_ID_PREFIX);
    await db.insert(users).values({ id, name: "測試", email: `${id}@example.test` });
    createdUsers.push(id);
    return id;
  };

  afterAll(async () => {
    if (createdUsers.length > 0) await db.delete(users).where(inArray(users.id, createdUsers));
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

    const scripts = await db
      .select({ id: screenplays.id })
      .from(screenplays)
      .where(eq(screenplays.projectId, a.projectId));
    expect(scripts).toHaveLength(1);
  });
});
