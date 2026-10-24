// @vitest-environment jsdom
/**
 * 票券 21 —— hub 上的自由文件：刪除不問、8 秒內可以復原、停在提示上時倒數暫停。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreeDocumentList, UNDO_WINDOW_MS } from "./free-document-list";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const documents = [
  { documentId: "dc_a", title: "世界觀", meta: "2026年10月24日 · 12 字", excerpt: "海島上的三個村落" },
  { documentId: "dc_b", title: null, meta: "2026年10月23日 · 0 字", excerpt: "" },
];

/** 滑鼠點擊：`detail` 是點擊次數；鍵盤觸發的 click 是 0。 */
const clickWithMouse = (element: HTMLElement) => fireEvent.click(element, { detail: 1 });

/** 讓 server action 的 promise 走完。 */
const settle = () => act(async () => {});

function renderList(overrides: { deleteDocument?: () => Promise<boolean>; restoreDocument?: () => Promise<boolean> } = {}) {
  const deleteDocument = vi.fn(overrides.deleteDocument ?? (async () => true));
  const restoreDocument = vi.fn(overrides.restoreDocument ?? (async () => true));
  render(
    <ul>
      <FreeDocumentList
        projectId="pj_1"
        documents={documents}
        deleteDocument={deleteDocument}
        restoreDocument={restoreDocument}
      />
    </ul>,
  );
  return { deleteDocument, restoreDocument };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("刪除自由文件", () => {
  it("沒命名的文件顯示「未命名文件」", () => {
    renderList();
    expect(screen.getByRole("link", { name: "未命名文件" })).toBeTruthy();
  });

  it("按下刪除就不見了，不先問確定嗎", async () => {
    const { deleteDocument } = renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    expect(deleteDocument).toHaveBeenCalledWith("dc_a");
    expect(screen.queryByRole("link", { name: "世界觀" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("已刪除「世界觀」");
  });

  it("按「復原」就回來", async () => {
    const { restoreDocument } = renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    clickWithMouse(screen.getByRole("button", { name: "復原" }));
    await settle();

    expect(restoreDocument).toHaveBeenCalledWith("dc_a");
    expect(screen.getByRole("link", { name: "世界觀" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("8 秒後提示自己收掉", async () => {
    renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS - 1));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("滑鼠停在提示上時倒數暫停，離開後接著倒數剩下的", async () => {
    renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS - 3000 - 100));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("鍵盤焦點在「復原」上時也暫停", async () => {
    renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    fireEvent.focus(screen.getByRole("button", { name: "復原" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("用鍵盤刪除時，焦點直接交給「復原」（那一列連同按鈕一起消失了）", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "刪除「世界觀」" }), { detail: 0 });
    await settle();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "復原" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("用滑鼠刪除時不搶焦點，倒數照走", async () => {
    renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "復原" }));
  });

  it("提示不在清單裡（它不是清單的一項）", async () => {
    renderList();
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    expect(screen.getByRole("status").closest("ul")).toBeNull();
  });

  it("沒刪成就放回來，也不出現「復原」", async () => {
    renderList({ deleteDocument: async () => false });
    clickWithMouse(screen.getByRole("button", { name: "刪除「世界觀」" }));
    await settle();

    expect(screen.getByRole("link", { name: "世界觀" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
