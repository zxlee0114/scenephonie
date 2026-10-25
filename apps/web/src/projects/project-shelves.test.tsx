// @vitest-environment jsdom
/**
 * 票券 72 —— 儀表板上的封存與刪除：卡片選單、兩個收合區塊、「復原」提示、有分享連結時才確認。
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "./project-store";
import { ProjectShelves, type ShelfActions } from "./project-shelves";
import type { DashboardShelves } from "./retention";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-25T12:00:00+08:00");

const card = (title: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  projectId: `pj_${title}`,
  title,
  screenplayTitle: title,
  lastEditedAt: now,
  archivedAt: null,
  deletedAt: null,
  activeShareLinks: 0,
  ...overrides,
});

const empty: DashboardShelves = { active: [], archived: [], deleted: [] };

/** 讓 server action 的 promise 走完。 */
const settle = () => act(async () => {});

function renderShelves(shelves: Partial<DashboardShelves>) {
  const actions: ShelfActions = {
    archive: vi.fn(async () => true),
    unarchive: vi.fn(async () => true),
    delete: vi.fn(async () => true),
    restore: vi.fn(async () => true),
  };
  render(<ProjectShelves shelves={{ ...empty, ...shelves }} now={now} actions={actions} />);
  return actions;
}

/** 打開某張卡的「⋯」選單，選其中一列。 */
const pick = (title: string, row: string) => {
  fireEvent.click(screen.getByRole("button", { name: `「${title}」的更多動作` }));
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: row }));
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("儀表板的三區", () => {
  it("沒有封存、沒有刪除的時候，那兩區根本不出現", () => {
    renderShelves({ active: [card("甲")] });

    expect(screen.queryByText(/已封存/)).toBeNull();
    expect(screen.queryByText(/已刪除/)).toBeNull();
  });

  it("主區空了、但下面還有封存或刪除的：不說「還沒有專案」，指向下面", () => {
    renderShelves({ archived: [card("乙", { archivedAt: now })] });

    expect(screen.queryByText(/還沒有專案/)).toBeNull();
    expect(screen.getByText("其他專案在下面的「已封存」或「已刪除」裡。")).toBeTruthy();
  });

  it("一個專案都沒有：還沒有專案", () => {
    renderShelves({});

    expect(screen.getByText("還沒有專案。按「建立專案」開始第一部。")).toBeTruthy();
  });

  it("有的時候是預設收起的區塊，標題帶數量", () => {
    renderShelves({
      active: [card("甲")],
      archived: [card("乙", { archivedAt: now })],
      deleted: [card("丙", { deletedAt: now }), card("丁", { deletedAt: now })],
    });

    const archived = screen.getByText("已封存（1）").closest("details")!;
    const deleted = screen.getByText("已刪除（2）").closest("details")!;
    expect(archived.open).toBe(false);
    expect(deleted.open).toBe(false);
    expect(within(archived).getByRole("link", { name: "乙" })).toBeTruthy();
  });
});

describe("封存", () => {
  it("主區卡片的選單「封存」：卡片離開主區，提示「已封存」，按復原就取消封存", async () => {
    const actions = renderShelves({ active: [card("甲"), card("乙")] });

    pick("甲", "封存");
    await settle();

    expect(actions.archive).toHaveBeenCalledWith("pj_甲");
    expect(screen.queryByRole("link", { name: "甲" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("已封存「甲」");

    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    await settle();

    expect(actions.unarchive).toHaveBeenCalledWith("pj_甲");
    expect(screen.getByRole("link", { name: "甲" })).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("沒封存成：卡片留在原地，不跳提示", async () => {
    const actions = renderShelves({ active: [card("甲")] });
    vi.mocked(actions.archive).mockResolvedValueOnce(false);

    pick("甲", "封存");
    await settle();

    expect(screen.getByRole("link", { name: "甲" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("已封存的卡片選單是「取消封存」與「刪除」", async () => {
    const actions = renderShelves({ archived: [card("乙", { archivedAt: now })] });

    fireEvent.click(screen.getByRole("button", { name: "「乙」的更多動作" }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((row) => row.textContent)).toEqual([
      "取消封存",
      "刪除",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: "取消封存" }));
    await settle();
    expect(actions.unarchive).toHaveBeenCalledWith("pj_乙");
    expect(refresh).toHaveBeenCalled();
  });
});

describe("刪除與還原", () => {
  it("沒有分享連結：不先問，直接刪，提示「已刪除」；按復原就還原", async () => {
    const actions = renderShelves({ active: [card("甲")] });

    pick("甲", "刪除");
    await settle();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(actions.delete).toHaveBeenCalledWith("pj_甲");
    expect(screen.queryByRole("link", { name: "甲" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("已刪除「甲」");

    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    await settle();

    expect(actions.restore).toHaveBeenCalledWith("pj_甲");
    expect(screen.getByRole("link", { name: "甲" })).toBeTruthy();
  });

  it("有生效的分享連結：先在頁內確認，寫出幾條會停用；取消就什麼都不做", async () => {
    const actions = renderShelves({ active: [card("甲", { activeShareLinks: 2 })] });

    pick("甲", "刪除");

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("2 條分享連結會立即停用");
    expect(dialog.textContent).toContain("30 天內");
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await settle();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(actions.delete).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "甲" })).toBeTruthy();
  });

  it("有生效的分享連結：確認之後才刪，一樣有復原", async () => {
    const actions = renderShelves({ active: [card("甲", { activeShareLinks: 1 })] });

    pick("甲", "刪除");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "刪除" }));
    await settle();

    expect(actions.delete).toHaveBeenCalledWith("pj_甲");
    expect(screen.getByRole("status").textContent).toContain("已刪除「甲」");
  });

  it("已封存的也能刪：離開已封存區，復原後回到已封存區", async () => {
    const actions = renderShelves({ archived: [card("乙", { archivedAt: now })] });

    pick("乙", "刪除");
    await settle();
    expect(actions.delete).toHaveBeenCalledWith("pj_乙");
    expect(screen.queryByRole("link", { name: "乙" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "復原" }));
    await settle();
    expect(screen.getByRole("link", { name: "乙" })).toBeTruthy();
  });

  it("已刪除的卡打不開，只有倒數與「還原」；最快到期的在前由伺服器排好", async () => {
    const actions = renderShelves({
      deleted: [card("丙", { deletedAt: new Date(now.getTime() - 28 * DAY) }), card("丁", { deletedAt: now })],
    });

    const deleted = screen.getByText("已刪除（2）").closest("details")!;
    expect(within(deleted).queryByRole("link")).toBeNull();
    expect(within(deleted).queryByRole("button", { name: /更多動作/ })).toBeNull();
    expect(deleted.textContent).toContain("還剩 2 天");
    expect(deleted.textContent).toContain("還剩 30 天");

    fireEvent.click(within(deleted).getByRole("button", { name: "還原「丙」" }));
    await settle();

    expect(actions.restore).toHaveBeenCalledWith("pj_丙");
    expect(within(deleted).queryByText("丙")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });
});

describe("refresh 之後，伺服器那份三區說了算", () => {
  it("封存 → 取消封存 → 又回到主區：卡片看得到（不被先前藏起來的鍵擋住）", async () => {
    const actions: ShelfActions = {
      archive: vi.fn(async () => true),
      unarchive: vi.fn(async () => true),
      delete: vi.fn(async () => true),
      restore: vi.fn(async () => true),
    };
    const a = card("甲");
    const { rerender } = render(<ProjectShelves shelves={{ ...empty, active: [a] }} now={now} actions={actions} />);

    pick("甲", "封存");
    await settle();
    // refresh：伺服器說它在已封存。
    rerender(<ProjectShelves shelves={{ ...empty, archived: [{ ...a, archivedAt: now }] }} now={now} actions={actions} />);

    pick("甲", "取消封存");
    await settle();
    // refresh：伺服器說它回到主區了。
    rerender(<ProjectShelves shelves={{ ...empty, active: [a] }} now={now} actions={actions} />);

    expect(screen.getByRole("link", { name: "甲" })).toBeTruthy();
  });
});
