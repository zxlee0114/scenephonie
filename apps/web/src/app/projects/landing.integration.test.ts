import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { mintId } from "@scenephonie/schema";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ownedProjects } from "@/projects/project-store";

/**
 * 票券 71：登入之後落在**專案儀表板**，而且**打開儀表板不會替人建專案**（票券 06 的落點會）。
 *
 * session 換成一個假的 `currentUserId`；`redirect` 換成丟出它要去的網址 —— Next 的 redirect 本來就是丟例外。
 * 儀表板那一頁照真的跑，查的是真的資料庫。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/authorization")>()),
  currentUserId: async () => session.userId,
}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
  useRouter: () => ({ push: () => {} }),
}));

const { default: HomePage } = await import("../page");
const { default: LoginPage } = await import("../login/page");
const { default: ProjectsPage } = await import("./page");

/** 這一頁要把人送去哪裡；沒有轉址就是 `null`。 */
async function redirectOf(render: () => Promise<unknown>): Promise<string | null> {
  try {
    await render();
    return null;
  } catch (error) {
    if (error instanceof Redirected) return error.url;
    throw error;
  }
}

describe.skipIf(!hasDatabase)("登入後的落點（需要 Postgres）", () => {
  const createdUsers: string[] = [];

  const signIn = async (): Promise<string> => {
    const id = mintId(USER_ID_PREFIX);
    await getDb().insert(users).values({ id, name: "測試", email: `${id}@example.test` });
    createdUsers.push(id);
    session.userId = id;
    return id;
  };

  afterAll(async () => {
    if (createdUsers.length > 0) await getDb().delete(users).where(inArray(users.id, createdUsers));
  });

  it("已登入打開 `/` 或 `/login`：送去儀表板", async () => {
    await signIn();

    expect(await redirectOf(() => HomePage())).toBe("/projects");
    expect(await redirectOf(() => LoginPage({ searchParams: Promise.resolve({}) }))).toBe("/projects");
  });

  it("新帳號打開儀表板：留在儀表板，沒有替他建任何專案", async () => {
    const userId = await signIn();

    expect(await redirectOf(() => ProjectsPage())).toBeNull();
    expect(await ownedProjects(userId)).toEqual([]);
  });

  it("沒登入打開儀表板：送去登入頁", async () => {
    session.userId = null;

    expect(await redirectOf(() => ProjectsPage())).toBe("/login");
  });
});
