import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { mintId } from "@scenephonie/schema";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, users } from "@/db/schema";
import { createScreenplay } from "@/persistence";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import { authorizeProjectForUser, authorizeScreenplayForUser } from "./gate";

/**
 * gate 的真實行為 —— 它問的是資料庫裡的 `owner_id`，所以只在真的 Postgres 上才成立。
 *
 * 這一組守的是驗收框那一條：**另一個使用者對非自己的專案，gate 回絕**（不是靠 UI 藏）。
 *
 * 沒有 `DATABASE_URL` 就整組跳過：本機 `docker compose up -d db` 之後才跑得到；
 * CI 起了 postgres service，所以在 CI 一定會跑。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("授權 gate（需要 Postgres）", () => {
  const db = getDb();
  const createdUsers: string[] = [];

  const newUser = async (): Promise<string> => {
    const id = mintId(USER_ID_PREFIX);
    // 直接寫 `users` —— gate 只認 `users.id`，它不知道也不該知道這個人是怎麼登入的。
    await db.insert(users).values({ id, name: "測試", email: `${id}@example.test` });
    createdUsers.push(id);
    return id;
  };

  const newProject = async (ownerId: string): Promise<string> => {
    const id = mintId(PROJECT_ID_PREFIX);
    await db.insert(projects).values({ id, type: SINGLE_SCREENPLAY_PROJECT, title: "測試專案", ownerId });
    return id;
  };

  /** 走 persistence 建劇本 —— 直接 INSERT 會讓這個檔案認識 persistence 的內部欄位（§6.7）。 */
  const newScreenplay = async (ownerId: string, projectId: string): Promise<string> => {
    const project = await authorizeProjectForUser(ownerId, projectId);
    if (!project) throw new Error("剛建立的專案卻過不了 gate");
    const { screenplayId } = await createScreenplay(project, { type: "doc" });
    return screenplayId;
  };

  afterAll(async () => {
    // 專案與劇本隨 owner 的 FK cascade 一起走。
    if (createdUsers.length > 0) await db.delete(users).where(inArray(users.id, createdUsers));
  });

  it("擁有者拿得到 handle，handle 帶著資料庫裡的 owner_id", async () => {
    const owner = await newUser();
    const projectId = await newProject(owner);

    const granted = await authorizeProjectForUser(owner, projectId);
    expect(granted).toEqual(expect.objectContaining({ projectId, ownerId: owner }));
  });

  it("另一個使用者對非自己的專案被回絕", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const projectId = await newProject(owner);

    expect(await authorizeProjectForUser(intruder, projectId)).toBeNull();
  });

  it("不存在的專案與別人的專案回同一個答案 —— 否則它是一支存在性探針", async () => {
    const intruder = await newUser();
    expect(await authorizeProjectForUser(intruder, mintId(PROJECT_ID_PREFIX))).toBeNull();
  });

  it("劇本的授權從專案來（screenplays.project_id → projects.owner_id）", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const projectId = await newProject(owner);
    const screenplayId = await newScreenplay(owner, projectId);

    expect(await authorizeScreenplayForUser(owner, screenplayId)).toEqual(
      expect.objectContaining({ screenplayId, projectId, ownerId: owner }),
    );
    expect(await authorizeScreenplayForUser(intruder, screenplayId)).toBeNull();
  });

  it("換一個 owner，同一份劇本的授權就跟著換 —— 沒有第二份 owner 副本", async () => {
    const owner = await newUser();
    const nextOwner = await newUser();
    const projectId = await newProject(owner);
    const screenplayId = await newScreenplay(owner, projectId);

    await db.update(projects).set({ ownerId: nextOwner }).where(eq(projects.id, projectId));

    expect(await authorizeScreenplayForUser(owner, screenplayId)).toBeNull();
    expect(await authorizeScreenplayForUser(nextOwner, screenplayId)).not.toBeNull();
  });
});
