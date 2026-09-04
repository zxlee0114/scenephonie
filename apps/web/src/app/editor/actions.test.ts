/**
 * 寫入邊界的守衛：**進不了 `Node.fromJSON` 的 doc，不准進資料庫**。
 *
 * 由來是一次靜默的資料遺失（見 editor/plain-json.ts）——存檔回報成功，落庫的卻是一份
 * 每個節點的 attr 都被清空的 doc。客戶端的成因已經修掉；這裡保證同一類事故只要再發生，
 * 就會是一次大聲的失敗，而不是一份壞掉的稿。
 */
import { describe, expect, it, vi } from "vitest";

import type { SaveToken } from "@/persistence";

const saveScreenplay = vi.hoisted(() => vi.fn());
vi.mock("@/persistence", () => ({ saveScreenplay }));

const { saveScreenplayAction } = await import("./actions");

const token = "st_0" as SaveToken;

/** 一份 attr 被序列化吃掉的 doc —— 正是事故當時真的存進資料庫的形狀。 */
const docWithoutAttrs = {
  type: "doc",
  content: [{ type: "scene", content: [{ type: "action", content: [{ type: "text", text: "嗨" }] }] }],
};

describe("saveScreenplayAction 的寫入邊界驗證", () => {
  it("attr 掉光的 doc 會被擋下來，而且沒有碰到 persistence", async () => {
    saveScreenplay.mockClear();
    await expect(
      saveScreenplayAction({ screenplayId: "sp_x", doc: docWithoutAttrs, token }),
    ).rejects.toThrow();
    expect(saveScreenplay).not.toHaveBeenCalled();
  });

  it("完整的 doc 照常放行", async () => {
    saveScreenplay.mockClear();
    saveScreenplay.mockResolvedValue({ status: "saved", token: "st_1" });
    const doc = {
      type: "doc",
      content: [
        {
          type: "scene",
          attrs: { sceneId: "sc_abc" },
          content: [{ type: "action", content: [{ type: "text", text: "嗨" }] }],
        },
      ],
    };
    await expect(saveScreenplayAction({ screenplayId: "sp_x", doc, token })).resolves.toEqual({
      status: "saved",
      token: "st_1",
    });
    expect(saveScreenplay).toHaveBeenCalledOnce();
  });
});
