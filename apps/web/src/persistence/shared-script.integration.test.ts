import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintId, mintSceneId } from "@scenephonie/schema";

import { authorizeProjectForUser, authorizeScreenplayForUser, authorizeShareToken } from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { createLocation, renameLocation } from "@/entities";
import { getDb } from "@/db/client";
import { projects, users } from "@/db/schema";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";
import { shareDelivery, shareLive } from "@/share/share-store";

import { createDelivery } from "./delivery-store";
import type { PersistedDoc } from "./doc-schema-version";
import { createScreenplay, loadScreenplay, saveScreenplay } from "./screenplay-store";
import { loadSharedScript } from "./shared-script";

/**
 * 分享頁讀到的內容（票券 20，§10）。即時讀 live doc 的**交付投影**（草稿不進，同 PDF）；凍結只讀
 * 那筆交付 —— 之後怎麼改稿都碰不到它。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** 內外、時間、地點都填了 ＝ 正式場次。地點引用不必真的有實體 —— 投影照樣印顯示名。 */
const formal = (text: string, locationId = "lo_x") => ({
  type: "scene",
  attrs: { sceneId: mintSceneId(), time: "日", intExt: "內景", location: { locationId, displayName: "客廳" } },
  content: [{ type: "action", content: [{ type: "text", text }] }],
});
/** 沒填內外 ＝ 草稿（§4.8）。 */
const draft = (text: string) => ({
  type: "scene",
  attrs: { sceneId: mintSceneId(), time: "日", intExt: null, location: null },
  content: [{ type: "action", content: [{ type: "text", text }] }],
});
const docOf = (...scenes: object[]): PersistedDoc => ({ type: "doc", content: scenes });

const texts = (script: { type: string; text?: string }[]) => script.flatMap((e) => (e.text ? [e.text] : []));

describe.skipIf(!hasDatabase)("loadSharedScript（需要 Postgres）", () => {
  const ownerId = mintId(USER_ID_PREFIX);
  let projectId: string;

  beforeAll(async () => {
    await getDb().insert(users).values({ id: ownerId, name: "測試", email: `${ownerId}@example.test` });
    projectId = mintId(PROJECT_ID_PREFIX);
    await getDb().insert(projects).values({ id: projectId, type: SINGLE_SCREENPLAY_PROJECT, title: "測試專案", ownerId });
  });

  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, ownerId));
  });

  const freshScreenplay = async (doc: PersistedDoc) => {
    const project = await authorizeProjectForUser(ownerId, projectId);
    const fresh = await createScreenplay(project!, doc);
    return (await authorizeScreenplayForUser(ownerId, fresh.screenplayId))!;
  };

  it("即時：讀的是現在存檔的那一份，不含草稿；附最後更新時間", async () => {
    const screenplay = await freshScreenplay(docOf(formal("走進房間"), draft("還沒想好")));
    const viewer = await authorizeShareToken((await shareLive(screenplay)).token);

    const first = await loadSharedScript(viewer!);
    expect(first).toMatchObject({ kind: "live", updatedAt: expect.any(Date) });
    expect(texts(first!.payload.script)).toEqual(["走進房間"]);

    const loaded = await loadScreenplay(screenplay);
    await saveScreenplay({ screenplay, doc: docOf(formal("走出房間")), token: loaded!.token });

    const second = await loadSharedScript(viewer!);
    expect(texts(second!.payload.script)).toEqual(["走出房間"]);
    expect(second?.kind === "live" && first?.kind === "live" && second.updatedAt > first.updatedAt).toBe(true);
  });

  it("即時：改實體名（劇本沒存檔）也推進「最後更新於」，頁面上是新名字", async () => {
    const project = (await authorizeProjectForUser(ownerId, projectId))!;
    const location = await createLocation(project, { name: "未知大樓房間" });
    const screenplay = await freshScreenplay(docOf(formal("走進房間", location.id)));
    const viewer = await authorizeShareToken((await shareLive(screenplay)).token);
    const before = await loadSharedScript(viewer!);

    await renameLocation(project, location.id, "海豚公寓房間");

    const after = await loadSharedScript(viewer!);
    expect(after?.payload.scenes[0]?.locations[0]?.name).toBe("海豚公寓房間");
    expect(after?.kind === "live" && before?.kind === "live" && after.updatedAt > before.updatedAt).toBe(true);
  });

  it("凍結：讀的是那筆交付與它的交付時間；之後改稿碰不到它", async () => {
    const screenplay = await freshScreenplay(docOf(formal("走進房間")));
    const delivery = await createDelivery(screenplay);
    const viewer = await authorizeShareToken((await shareDelivery(screenplay, delivery!.deliveryId))!.token);

    const loaded = await loadScreenplay(screenplay);
    await saveScreenplay({ screenplay, doc: docOf(formal("改過的稿")), token: loaded!.token });

    expect(await loadSharedScript(viewer!)).toEqual({
      kind: "frozen",
      deliveredAt: delivery!.createdAt,
      payload: delivery!.payload,
    });
  });
});
