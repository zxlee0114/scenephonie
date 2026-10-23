import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintId, mintSceneId } from "@scenephonie/schema";

import { USER_ID_PREFIX } from "@/auth/auth";
import { getDb } from "@/db/client";
import { projects, users } from "@/db/schema";
import { createDelivery, createScreenplay, saveScreenplay } from "@/persistence";
import { PROJECT_ID_PREFIX, SINGLE_SCREENPLAY_PROJECT } from "@/projects/project-store";
import { revokeShareLinks, setShareLinkNote, shareDelivery, shareLive } from "@/share/share-store";

import { authorizeProjectForUser, authorizeScreenplayForUser, authorizeShareToken, type ShareViewer } from ".";

/**
 * `/s/<token>` 的 gate（票券 20，ADR-0011 §②）：`ShareViewer` 是**另一種 authorization subject**，
 * 不是第二套授權機制 —— 它從同一個 gate 鑄出來，寫路徑不接受它。
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("authorizeShareToken（需要 Postgres）", () => {
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

  const freshScreenplay = async () => {
    const project = await authorizeProjectForUser(ownerId, projectId);
    const doc = {
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: mintSceneId(), time: "日", intExt: "內景", location: null } }],
    };
    const fresh = await createScreenplay(project!, doc);
    return (await authorizeScreenplayForUser(ownerId, fresh.screenplayId))!;
  };

  it("即時連結的 token 換到一個沒有交付的 viewer；凍結連結的換到指向那筆交付的 viewer", async () => {
    const screenplay = await freshScreenplay();
    const live = await shareLive(screenplay);
    const delivery = await createDelivery(screenplay);
    const frozen = await shareDelivery(screenplay, delivery!.deliveryId);

    expect(await authorizeShareToken(live.token)).toMatchObject({
      screenplayId: screenplay.screenplayId,
      projectId,
      deliveryId: null,
    });
    expect(await authorizeShareToken(frozen!.token)).toMatchObject({
      screenplayId: screenplay.screenplayId,
      deliveryId: delivery!.deliveryId,
    });
  });

  it("撤銷過的與不存在的 token 是同一個答案（null）—— 不透露劇本是否存在", async () => {
    const screenplay = await freshScreenplay();
    const live = await shareLive(screenplay);
    await revokeShareLinks(screenplay, [live.shareId]);

    expect(await authorizeShareToken(live.token)).toBeNull();
    expect(await authorizeShareToken("not-a-token")).toBeNull();
  });
});

/**
 * 寫路徑不接受 `ShareViewer` —— **在型別上表示不出來**，不是靠每個 handler 記得檢查（不變式 H）。
 * 這一組的斷言在 `tsc` 裡：`@ts-expect-error` 一旦不再報錯（viewer 變得能塞進寫路徑），typecheck 就紅。
 */
describe("ShareViewer 進不了寫路徑", () => {
  it("存檔、建立交付、鑄連結都只吃劇本的 handle", () => {
    const writes = (viewer: ShareViewer) => {
      // @ts-expect-error —— 存檔要 AuthorizedScreenplay
      void saveScreenplay({ screenplay: viewer, doc: {}, token: "" as never });
      // @ts-expect-error —— 建立交付要 AuthorizedScreenplay
      void createDelivery(viewer);
      // @ts-expect-error —— 鑄連結是編劇的動作
      void shareLive(viewer);
      // @ts-expect-error —— 撤銷也是
      void revokeShareLinks(viewer, ["sh_x"]);
      // @ts-expect-error —— 讀者不能改編劇的備註。
      void setShareLinkNote(viewer, "sh_x", "x");
    };
    expect(writes).toBeTypeOf("function");
  });
});
