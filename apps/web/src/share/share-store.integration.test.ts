import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { mintId, mintSceneId } from "@scenephonie/schema";

import { authorizeProjectForUser, authorizeScreenplayForUser, type AuthorizedScreenplay } from "@/authorization";
import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, screenplays, shareLinks, users } from "@/db/schema";
import { createLocation, renameLocation } from "@/entities";
import { createDelivery, createScreenplay, loadScreenplay, saveScreenplay, type PersistedDoc } from "@/persistence";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";

import { listShareLinks, revokeShareLinks, setShareLinkNote, shareDelivery, shareLive } from "./share-store";

/**
 * 分享連結的生命週期（票券 20，§10、ADR-0008）—— 真的 Postgres：「撤銷保留那一列」「重按拿到同一條」
 * 只在真的資料庫上才成立。沒有 `DATABASE_URL` 就整組跳過。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

const scene = (text: string) => ({
  type: "scene",
  attrs: { sceneId: mintSceneId(), time: "日", intExt: "內景", location: null },
  content: [{ type: "action", content: [{ type: "text", text }] }],
});
/** 內外、時間、地點都填了 ＝ 正式場次 —— 會進交付。 */
const formalAt = (locationId: string, displayName: string) => ({
  type: "scene",
  attrs: { sceneId: mintSceneId(), time: "日", intExt: "內景", location: { locationId, displayName } },
  content: [{ type: "action", content: [{ type: "text", text: "走進房間" }] }],
});
const docOf = (...scenes: object[]): PersistedDoc => ({ type: "doc", content: scenes });

describe.skipIf(!hasDatabase)("share store（需要 Postgres）", () => {
  const ownerId = mintId(USER_ID_PREFIX);
  let projectId: string;
  const created: string[] = [];

  const freshScreenplay = async (doc = docOf(scene("走進房間"))): Promise<AuthorizedScreenplay> => {
    const project = await authorizeProjectForUser(ownerId, projectId);
    const fresh = await createScreenplay(project!, doc, { title: "測試劇本" });
    created.push(fresh.screenplayId);
    const handle = await authorizeScreenplayForUser(ownerId, fresh.screenplayId);
    if (!handle) throw new Error("gate 不認得剛建立的劇本");
    return handle;
  };

  beforeAll(async () => {
    await getDb().insert(users).values({ id: ownerId, name: "測試", email: `${ownerId}@example.test` });
    projectId = mintId(PROJECT_ID_PREFIX);
    await getDb().insert(projects).values({ id: projectId, type: SINGLE_SCREENPLAY_PROJECT, title: "測試專案", ownerId });
  });

  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, ownerId));
  });

  afterEach(async () => {
    for (const id of created.splice(0)) await getDb().delete(screenplays).where(eq(screenplays.id, id));
  });

  it("快照必然、連結自願：匯出不鑄 token；按「取得這次交付的連結」才鑄，再按拿到同一條", async () => {
    const screenplay = await freshScreenplay();
    const delivery = await createDelivery(screenplay);

    expect(await listShareLinks(screenplay)).toEqual([]);

    const first = await shareDelivery(screenplay, delivery!.deliveryId);
    const again = await shareDelivery(screenplay, delivery!.deliveryId);

    expect(first?.token).toEqual(expect.any(String));
    expect(again?.token).toBe(first?.token);
    expect((await listShareLinks(screenplay)).map((l) => l.shareId)).toEqual([first!.shareId]);
  });

  it("即時分享一份劇本一條：再按拿回同一條；它在清單上是即時（沒有交付）", async () => {
    const screenplay = await freshScreenplay();

    const live = await shareLive(screenplay);

    expect((await shareLive(screenplay)).token).toBe(live.token);
    expect(await listShareLinks(screenplay)).toEqual([
      expect.objectContaining({ shareId: live.shareId, token: live.token, delivery: null }),
    ]);
  });

  it("撤銷寫 revoked_at、保留那一列；重新分享 ＝ 鑄新 token，舊的不復活", async () => {
    const screenplay = await freshScreenplay();
    const live = await shareLive(screenplay);

    expect(await revokeShareLinks(screenplay, [live.shareId])).toBe(1);

    expect(await listShareLinks(screenplay)).toEqual([]);
    const [kept] = await getDb().select().from(shareLinks).where(eq(shareLinks.id, live.shareId));
    expect(kept?.revokedAt).toBeInstanceOf(Date);

    const again = await shareLive(screenplay);
    expect(again.token).not.toBe(live.token);
  });

  it("別份劇本的連結撤不掉 —— 連結掛在劇本的 handle 底下", async () => {
    const mine = await freshScreenplay();
    const other = await freshScreenplay();
    const theirs = await shareLive(other);

    expect(await revokeShareLinks(mine, [theirs.shareId])).toBe(0);
    expect(await listShareLinks(other)).toHaveLength(1);
  });

  it("別份劇本的交付取不到連結", async () => {
    const mine = await freshScreenplay();
    const other = await freshScreenplay();
    const delivery = await createDelivery(other);

    expect(await shareDelivery(mine, delivery!.deliveryId)).toBeNull();
  });

  it("編劇的清單看得到漂移：交付出去的內容之後變了才算「之後改過」，只改草稿不算", async () => {
    const project = (await authorizeProjectForUser(ownerId, projectId))!;
    const room = await createLocation(project, { name: "房間" });
    const formal = formalAt(room.id, "房間");
    const screenplay = await freshScreenplay(docOf(formal));
    const delivery = await createDelivery(screenplay);
    const link = await shareDelivery(screenplay, delivery!.deliveryId);

    const [before] = await listShareLinks(screenplay);
    expect(before?.delivery).toEqual({
      deliveryId: delivery!.deliveryId,
      deliveredAt: delivery!.createdAt,
      changedSince: false,
    });

    // 存了檔，但只多了一場草稿 —— 交付出去的那一份長得一模一樣。
    let loaded = await loadScreenplay(screenplay);
    await saveScreenplay({ screenplay, doc: docOf(formal, scene("還沒想好")), token: loaded!.token });
    expect((await listShareLinks(screenplay))[0]?.delivery?.changedSince).toBe(false);

    loaded = await loadScreenplay(screenplay);
    const rewritten = { ...formal, content: [{ type: "action", content: [{ type: "text", text: "改過的稿" }] }] };
    await saveScreenplay({ screenplay, doc: docOf(rewritten, scene("還沒想好")), token: loaded!.token });

    const [after] = await listShareLinks(screenplay);
    expect(after).toMatchObject({ shareId: link!.shareId, delivery: { changedSince: true } });
  });

  it("改實體名也算「之後改過」—— 只算交付裡印得出來的那幾個（劇本本身沒存檔）", async () => {
    const project = (await authorizeProjectForUser(ownerId, projectId))!;
    const delivered = await createLocation(project, { name: "未知大樓房間" });
    const elsewhere = await createLocation(project, { name: "海邊" });
    const screenplay = await freshScreenplay(docOf(formalAt(delivered.id, "房間")));
    const delivery = await createDelivery(screenplay);
    await shareDelivery(screenplay, delivery!.deliveryId);

    await renameLocation(project, elsewhere.id, "沙灘");
    expect((await listShareLinks(screenplay))[0]?.delivery?.changedSince).toBe(false);

    await renameLocation(project, delivered.id, "海豚公寓房間");
    expect((await listShareLinks(screenplay))[0]?.delivery?.changedSince).toBe(true);
  });

  it("一次停用勾選的幾條：別份劇本的、早就停用的混在裡面也只停到自己這份還有效的", async () => {
    const screenplay = await freshScreenplay();
    const other = await freshScreenplay();
    const [a, b, c] = await Promise.all(
      [1, 2, 3].map(async () => (await shareDelivery(screenplay, (await createDelivery(screenplay))!.deliveryId))!),
    );
    const theirs = await shareLive(other);
    await revokeShareLinks(screenplay, [c!.shareId]);

    expect(await revokeShareLinks(screenplay, [a!.shareId, b!.shareId, c!.shareId, theirs.shareId])).toBe(2);
    expect(await listShareLinks(screenplay)).toEqual([]);
    expect(await listShareLinks(other)).toHaveLength(1);
    expect(await revokeShareLinks(screenplay, [])).toBe(0);
  });

  it("備註：編劇自己認得這條給了誰；去掉前後空白、空白 ＝ 沒有備註；別份劇本的改不到", async () => {
    const screenplay = await freshScreenplay();
    const other = await freshScreenplay();
    const live = await shareLive(screenplay);
    expect((await listShareLinks(screenplay))[0]?.note).toBeNull();

    expect(await setShareLinkNote(screenplay, live.shareId, "  給優良劇本獎評審 ")).toBe(true);
    expect((await listShareLinks(screenplay))[0]?.note).toBe("給優良劇本獎評審");

    expect(await setShareLinkNote(screenplay, live.shareId, "   ")).toBe(true);
    expect((await listShareLinks(screenplay))[0]?.note).toBeNull();

    expect(await setShareLinkNote(other, live.shareId, "偷改")).toBe(false);
    expect(await setShareLinkNote(screenplay, live.shareId, "長".repeat(101))).toBe(false);
  });
});
