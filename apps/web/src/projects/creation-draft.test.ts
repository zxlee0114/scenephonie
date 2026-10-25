// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { blankCreationDraft, creationDraftStore, type CreationDraft } from "./creation-draft";

const prose = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const filled = (overrides: Partial<CreationDraft> = {}): CreationDraft => ({
  ...blankCreationDraft(),
  projectTitle: "海豚計畫",
  ...overrides,
});

describe("建立精靈的本機草稿（票券 71）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("存了讀得回來，連同停在哪一步、哪個頁籤", () => {
    const store = creationDraftStore("usr_a");
    const draft = filled({ step: 2, tab: "分場大綱", submissionOutline: prose("海豚") });

    expect(store.save(draft)).toBe(true);

    expect(store.load()).toMatchObject({ ...draft, savedAt: expect.any(Number) });
  });

  it("一個使用者一格：同一台瀏覽器換了人，看不到前一個人的", () => {
    creationDraftStore("usr_a").save(filled());

    expect(creationDraftStore("usr_b").load()).toBeNull();
  });

  it("什麼都沒填就不存（只有空白也算沒填）；原本存著的也一起拿掉", () => {
    const store = creationDraftStore("usr_a");
    store.save(filled());

    expect(store.save({ ...blankCreationDraft(), projectTitle: "  ", sceneOutline: prose(" ") })).toBe(true);

    expect(store.load()).toBeNull();
  });

  it("只寫了大綱、名字都空著：也算有填", () => {
    const store = creationDraftStore("usr_a");

    store.save({ ...blankCreationDraft(), sceneOutline: prose("第一場") });

    expect(store.load()?.sceneOutline).toEqual(prose("第一場"));
  });

  it("清掉之後就沒有了", () => {
    const store = creationDraftStore("usr_a");
    store.save(filled());

    store.clear();

    expect(store.load()).toBeNull();
  });

  it("瀏覽器存不進去（配額滿、封鎖站台資料）：回報 false，不丟例外", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(creationDraftStore("usr_a").save(filled())).toBe(false);
  });

  it("讀不到或讀到壞掉的東西：當作沒有草稿", () => {
    localStorage.setItem("scenephonie:creation-draft:usr_a", "{not json");
    expect(creationDraftStore("usr_a").load()).toBeNull();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(creationDraftStore("usr_a").load()).toBeNull();
  });

  it("每一份新草稿有自己的建立鍵", () => {
    expect(blankCreationDraft().creationId).not.toBe(blankCreationDraft().creationId);
  });
});
