/**
 * 存檔入口的兩道關卡，順序有意義：**先授權，再驗證 doc**。
 *
 * 1. **授權**（票券 06）：`screenplayId` 從瀏覽器來。Server Action 是公開端點 ——
 *    畫面上沒有連結不代表沒有人打得到，所以每一次存檔都要重新過 gate（不變式 H）。
 * 2. **寫入邊界**：進不了 `Node.fromJSON` 的 doc 不准進資料庫。由來是一次靜默的資料遺失
 *    （見 editor/plain-json.ts）——存檔回報成功，落庫的卻是一份每個節點的 attr 都被清空的 doc。
 */
import { describe, expect, it, vi } from "vitest";

import type { SaveToken } from "@/persistence";

const saveScreenplay = vi.hoisted(() => vi.fn());
const createDelivery = vi.hoisted(() => vi.fn());
const authorizeScreenplay = vi.hoisted(() => vi.fn());
vi.mock("@/persistence", () => ({ saveScreenplay, createDelivery }));
vi.mock("@/authorization", () => ({ authorizeScreenplay }));

const { saveScreenplayAction, createDeliveryAction } = await import("./actions");

const token = "st_0" as SaveToken;

/** gate 放行時給出的 handle。真的那個由 `authorization/gate.ts` 從資料庫的 `owner_id` 鑄造。 */
const granted = { screenplayId: "sp_x", projectId: "pj_x", ownerId: "usr_owner" };

const goodDoc = {
  type: "doc",
  content: [
    {
      type: "scene",
      attrs: { sceneId: "sc_abc" },
      content: [{ type: "action", content: [{ type: "text", text: "嗨" }] }],
    },
  ],
};

/** 一份 attr 被序列化吃掉的 doc —— 正是事故當時真的存進資料庫的形狀。 */
const docWithoutAttrs = {
  type: "doc",
  content: [{ type: "scene", content: [{ type: "action", content: [{ type: "text", text: "嗨" }] }] }],
};

describe("saveScreenplayAction 的授權 gate", () => {
  it("不是自己的劇本存不進去，而且沒有碰到 persistence", async () => {
    saveScreenplay.mockClear();
    authorizeScreenplay.mockResolvedValue(null);

    await expect(
      saveScreenplayAction({ screenplayId: "sp_someone_else", doc: goodDoc, token }),
    ).resolves.toEqual({ status: "forbidden" });
    expect(saveScreenplay).not.toHaveBeenCalled();
  });

  it("gate 回絕時連 doc 都不驗 —— 否則它會變成一支形狀探針", async () => {
    saveScreenplay.mockClear();
    authorizeScreenplay.mockResolvedValue(null);

    await expect(
      saveScreenplayAction({ screenplayId: "sp_someone_else", doc: docWithoutAttrs, token }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("persistence 收到的是 gate 給的 handle，不是 client 傳來的字串", async () => {
    saveScreenplay.mockClear();
    authorizeScreenplay.mockResolvedValue(granted);
    saveScreenplay.mockResolvedValue({ status: "saved", token: "st_1" });

    await saveScreenplayAction({ screenplayId: "sp_x", doc: goodDoc, token });

    expect(saveScreenplay).toHaveBeenCalledWith({ screenplay: granted, doc: goodDoc, token });
  });
});

describe("saveScreenplayAction 的寫入邊界驗證", () => {
  it("attr 掉光的 doc 會被擋下來，而且沒有碰到 persistence", async () => {
    saveScreenplay.mockClear();
    authorizeScreenplay.mockResolvedValue(granted);

    await expect(
      saveScreenplayAction({ screenplayId: "sp_x", doc: docWithoutAttrs, token }),
    ).rejects.toThrow();
    expect(saveScreenplay).not.toHaveBeenCalled();
  });

  it("完整的 doc 照常放行", async () => {
    saveScreenplay.mockClear();
    authorizeScreenplay.mockResolvedValue(granted);
    saveScreenplay.mockResolvedValue({ status: "saved", token: "st_1" });

    await expect(
      saveScreenplayAction({ screenplayId: "sp_x", doc: goodDoc, token }),
    ).resolves.toEqual({ status: "saved", token: "st_1" });
    expect(saveScreenplay).toHaveBeenCalledOnce();
  });
});

/**
 * 匯出意圖的入口（票券 17）：建立一筆交付。它和存檔一樣是公開端點 —— 先過 gate，
 * persistence 收到的是 handle。
 */
describe("createDeliveryAction", () => {
  it("不是自己的劇本建不出交付，而且沒有碰到 persistence", async () => {
    createDelivery.mockClear();
    authorizeScreenplay.mockResolvedValue(null);

    await expect(createDeliveryAction({ screenplayId: "sp_someone_else" })).resolves.toEqual({
      status: "forbidden",
    });
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it("用 gate 給的 handle 建立交付，回傳那一筆交付的 id", async () => {
    createDelivery.mockClear();
    authorizeScreenplay.mockResolvedValue(granted);
    createDelivery.mockResolvedValue({ deliveryId: "dl_1", createdAt: new Date(), payload: {} });

    await expect(createDeliveryAction({ screenplayId: "sp_x" })).resolves.toEqual({
      status: "delivered",
      deliveryId: "dl_1",
    });
    expect(createDelivery).toHaveBeenCalledWith(granted);
  });

  it("劇本在授權之後才不見 —— 與「不是你的」同一個答案", async () => {
    authorizeScreenplay.mockResolvedValue(granted);
    createDelivery.mockResolvedValue(null);

    await expect(createDeliveryAction({ screenplayId: "sp_x" })).resolves.toEqual({ status: "forbidden" });
  });
});
