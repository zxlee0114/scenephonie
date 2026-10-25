import { describe, expect, it } from "vitest";

import type { ProjectSummary } from "./project-store";
import { dashboardShelves, projectPurgeCutoff, purgeCountdown } from "./retention";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date("2026-10-25T12:00:00+08:00");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("已刪除卡片上的倒數（票券 72）", () => {
  it("剛刪：還剩 30 天", () => {
    expect(purgeCountdown(now, now)).toBe("還剩 30 天");
  });

  it("剩一天又一點：無條件進位成 2 天 —— 寧可說多，不能說少", () => {
    expect(purgeCountdown(ago(28 * DAY + 20 * HOUR), now)).toBe("還剩 2 天");
  });

  it("剛好剩一天：還剩 1 天", () => {
    expect(purgeCountdown(ago(29 * DAY), now)).toBe("還剩 1 天");
  });

  it("不到一天：今天到期", () => {
    expect(purgeCountdown(ago(29 * DAY + 1 * HOUR), now)).toBe("今天到期");
  });

  it("過了 30 天、排程還沒跑到：仍是今天到期，不出現負數", () => {
    expect(purgeCountdown(ago(31 * DAY), now)).toBe("今天到期");
  });

  it("排程刪的是 30 天前（含）以前刪的", () => {
    expect(projectPurgeCutoff(now)).toEqual(new Date("2026-09-25T12:00:00+08:00"));
  });
});

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

describe("儀表板的三區（票券 72）", () => {
  it("沒刪沒封存的在主區；封存的在已封存；刪了的不管有沒有封存都在已刪除", () => {
    const shelves = dashboardShelves([
      card("甲"),
      card("乙", { archivedAt: ago(DAY) }),
      card("丙", { deletedAt: ago(DAY) }),
      card("丁", { archivedAt: ago(2 * DAY), deletedAt: ago(DAY) }),
    ]);

    expect(shelves.active.map(({ title }) => title)).toEqual(["甲"]);
    expect(shelves.archived.map(({ title }) => title)).toEqual(["乙"]);
    expect(shelves.deleted.map(({ title }) => title)).toEqual(["丙", "丁"]);
  });

  it("主區與已封存保持進來的順序（最近編輯在前）；已刪除是最快到期的在前", () => {
    const shelves = dashboardShelves([
      card("新封存", { archivedAt: ago(DAY) }),
      card("晚刪", { deletedAt: ago(DAY) }),
      card("舊封存", { archivedAt: ago(DAY) }),
      card("早刪", { deletedAt: ago(20 * DAY) }),
    ]);

    expect(shelves.archived.map(({ title }) => title)).toEqual(["新封存", "舊封存"]);
    expect(shelves.deleted.map(({ title }) => title)).toEqual(["早刪", "晚刪"]);
  });
});
