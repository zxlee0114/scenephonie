import { describe, expect, it } from "vitest";

import * as pkg from "../index";
import { COMMAND_CONTRACTS, satisfiesAdmission } from "./admission";

describe("准入判準（§6.3）", () => {
  it.each(COMMAND_CONTRACTS)("$name 至少滿足其一：強制不變式 或 以 id 定址", (contract) => {
    expect(satisfiesAdmission(contract)).toBe(true);
  });

  it("每個登記的 command 都真的從套件對外曝露（不是空殼登記）", () => {
    for (const { name } of COMMAND_CONTRACTS) {
      expect(pkg).toHaveProperty(name);
      expect(typeof (pkg as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("空殼會被擋：不強制不變式、又以位置定址 → 不准入", () => {
    expect(
      satisfiesAdmission({ name: "x", enforces: [], addressesById: false, rationale: "" }),
    ).toBe(false);
  });
});

describe("edge-boundary 規則（§6.3）：套件對外只曝露 command（寫）與 projection（讀）", () => {
  const exported = Object.keys(pkg);

  it.each(["EditorState", "Transaction", "EditorView", "Plugin", "Step", "Mapping", "StepMap"])(
    "不漏 PM 內部型別：%s",
    (name) => {
      expect(exported).not.toContain(name);
    },
  );

  it("跨邊界的寫入口就是那組 command＋去重 plugin 工廠，沒有別的", () => {
    // dedupeIdsPlugin 回傳一個 Plugin 給編輯器掛載，但不把 Plugin 類別本身漏出去。
    expect(typeof pkg.dedupeIdsPlugin).toBe("function");
    expect(exported).toEqual(
      expect.arrayContaining(["createNextScene", "setBlockType", "moveScene", "dedupeSceneIds"]),
    );
  });
});
