import { count, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { mintId, mintSceneId } from "@scenephonie/schema";

import {
  authorizeProjectForUser,
  authorizeScreenplayForUser,
  type AuthorizedProject,
  type AuthorizedScreenplay,
} from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { deliveries, projects, screenplays, users } from "@/db/schema";
import { createLocation, renameLocation } from "@/entities";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import { createDelivery, loadDelivery } from "./delivery-store";
import type { PersistedDoc } from "./doc-schema-version";
import { createScreenplay, loadScreenplay, saveScreenplay } from "./screenplay-store";

/**
 * 交付的寫入路徑（票券 17，§4.9、§9.2、ADR-0008）—— 真的 Postgres，不用替身：
 * 「建立交付是單一交易」「重試不產生第二列」只在真的資料庫上才成立。
 *
 * 沒有 `DATABASE_URL` 就整組跳過（同 `screenplay-store.integration.test.ts`）。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** 一場填完 metadata、有內文的正式場次（JSON 形狀，同存進 `screenplays.doc` 的那一份）。 */
const formalScene = (sceneId: string, text: string, location: { locationId: string; displayName: string }) => ({
  type: "scene",
  attrs: { sceneId, time: "日", intExt: "內景", location },
  content: [{ type: "action", content: [{ type: "text", text }] }],
});

const docOf = (...scenes: ReturnType<typeof formalScene>[]): PersistedDoc => ({ type: "doc", content: scenes });

describe.skipIf(!hasDatabase)("delivery store（需要 Postgres）", () => {
  const ownerId = mintId(USER_ID_PREFIX);
  const created: string[] = [];
  let project: AuthorizedProject;

  const authorized = async (screenplayId: string): Promise<AuthorizedScreenplay> => {
    const handle = await authorizeScreenplayForUser(ownerId, screenplayId);
    if (!handle) throw new Error(`gate 不認得 ${screenplayId}`);
    return handle;
  };

  /** 一份兩場的劇本：客廳（實體名「海豚公寓房間」、這一場叫「未知大樓房間」）→ 陽台。 */
  const twoSceneScreenplay = async () => {
    const room = await createLocation(project, { name: "海豚公寓房間" });
    const balcony = await createLocation(project, { name: "陽台" });
    const first = formalScene(mintSceneId(), "走進房間", { locationId: room.id, displayName: "未知大樓房間" });
    const second = formalScene(mintSceneId(), "點菸", { locationId: balcony.id, displayName: "陽台" });
    const fresh = await createScreenplay(project, docOf(first, second), { title: "測試劇本" });
    created.push(fresh.screenplayId);
    return { screenplay: await authorized(fresh.screenplayId), first, second, room };
  };

  const deliveriesOf = async (screenplayId: string) => {
    const [row] = await getDb()
      .select({ n: count() })
      .from(deliveries)
      .where(eq(deliveries.screenplayId, screenplayId));
    return row!.n;
  };

  beforeAll(async () => {
    await getDb().execute(sql`select 1 from ${deliveries} limit 1`);
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
    await getDb().delete(users).where(eq(users.id, ownerId));
  });

  afterEach(async () => {
    for (const id of created.splice(0)) {
      await getDb().delete(screenplays).where(eq(screenplays.id, id));
    }
  });

  it("匯出一次建立一筆交付：payload 是推導的結果（場次號、當時的實體名），不是場次樹", async () => {
    const { screenplay, first, second } = await twoSceneScreenplay();

    const delivery = await createDelivery(screenplay);

    expect(delivery?.payload.scenes.map((s) => [s.sceneId, s.label])).toEqual([
      [first.attrs.sceneId, "1"],
      [second.attrs.sceneId, "2"],
    ]);
    expect(delivery?.payload.scenes[0]?.locations).toEqual([{ name: "海豚公寓房間", displayName: "未知大樓房間" }]);
    expect(Object.keys(delivery!.payload).sort()).toEqual(["scenes", "script", "version"]);
  });

  it("同一份劇本連續匯出兩次 ＝ 兩筆交付，不去重", async () => {
    const { screenplay } = await twoSceneScreenplay();

    const a = await createDelivery(screenplay);
    const b = await createDelivery(screenplay);

    expect(a!.deliveryId).not.toBe(b!.deliveryId);
    expect(a!.payload).toEqual(b!.payload);
    expect(await deliveriesOf(screenplay.screenplayId)).toBe(2);
  });

  it("重試 ＝ 拿同一筆交付重新讀出來：同一個建立時間、同一份 payload，不產生第二列", async () => {
    const { screenplay } = await twoSceneScreenplay();
    const delivery = await createDelivery(screenplay);

    const retry = await loadDelivery(screenplay, delivery!.deliveryId);
    const again = await loadDelivery(screenplay, delivery!.deliveryId);

    expect(retry).toEqual(delivery);
    expect(again).toEqual(delivery);
    expect(await deliveriesOf(screenplay.screenplayId)).toBe(1);
  });

  it("不變式 E：交付之後改稿（調換場次）、實體改名，已承諾的場次號與實體名都不被重算", async () => {
    const { screenplay, first, second, room } = await twoSceneScreenplay();
    const delivery = await createDelivery(screenplay);

    const loaded = await loadScreenplay(screenplay);
    const saved = await saveScreenplay({ screenplay, doc: docOf(second, first), token: loaded!.token });
    expect(saved.status).toBe("saved");
    await renameLocation(project, room.id, "鯨魚公寓房間");

    const reread = await loadDelivery(screenplay, delivery!.deliveryId);
    expect(reread?.payload).toEqual(delivery!.payload);
    expect(reread?.payload.scenes.map((s) => [s.sceneId, s.label])).toEqual([
      [first.attrs.sceneId, "1"],
      [second.attrs.sceneId, "2"],
    ]);

    // 改稿之後的下一次匯出才看得到新的順序與新的名字。
    const next = await createDelivery(screenplay);
    expect(next?.payload.scenes.map((s) => s.sceneId)).toEqual([second.attrs.sceneId, first.attrs.sceneId]);
    expect(next?.payload.scenes[1]?.locations[0]?.name).toBe("鯨魚公寓房間");
  });

  it("別份劇本的交付 id 讀不到 —— 交付掛在劇本的 handle 底下", async () => {
    const mine = await twoSceneScreenplay();
    const other = await twoSceneScreenplay();
    const delivery = await createDelivery(other.screenplay);

    expect(await loadDelivery(mine.screenplay, delivery!.deliveryId)).toBeNull();
  });
});
