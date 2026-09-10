// @vitest-environment jsdom
/**
 * 目錄與寫入 doc 之間**沒有一次 render 的時間差**（票券 08 驗收回報的缺陷）。
 *
 * 「先建立實體、再寫入 doc」是不變式 ⑧ 成立的前提，但在 React 這一層它一度只是**邏輯上**
 * 的順序：建立走 `setState`，寫 doc 是同一個 tick 裡的同步呼叫 —— command 讀到的是上一次
 * render 的目錄，於是剛建好的實體被自己的不變式擋下（「實體 lo_… 不存在」）。
 *
 * 所以這條測試刻意**不等重繪**：`create` 一 resolve 就問 `directory`。
 */
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EntityCatalogProvider, useEntityCatalog, type EntityCatalog } from "./entity-catalog";

function catalogHandle(): EntityCatalog {
  let captured: EntityCatalog | null = null;
  const Probe = () => {
    captured = useEntityCatalog();
    return null;
  };
  render(
    <EntityCatalogProvider
      initial={{ characters: [], locations: [{ id: "lo_seed", name: "河堤" }] }}
    >
      <Probe />
    </EntityCatalogProvider>,
  );
  return captured!;
}

describe("實體目錄", () => {
  it("初始快照裡的實體一開始就在目錄裡", () => {
    expect(catalogHandle().directory.hasLocation("lo_seed")).toBe(true);
  });

  it("建立完的實體在同一個 tick 就查得到（不必等重繪）", async () => {
    const catalog = catalogHandle();

    await act(async () => {
      const created = await catalog.create("location", "派出所");
      // ⚠️ 這一行就是 doc 寫入發生的時刻 —— 中間沒有 render。
      expect(created).not.toBeNull();
      expect(catalog.directory.hasLocation(created!.id)).toBe(true);
    });
  });

  it("人物與地點各自認自己的 id", async () => {
    const catalog = catalogHandle();

    await act(async () => {
      const created = await catalog.create("character", "阿盈");
      expect(catalog.directory.hasCharacter(created!.id)).toBe(true);
      expect(catalog.directory.hasLocation(created!.id)).toBe(false);
    });
  });
});
