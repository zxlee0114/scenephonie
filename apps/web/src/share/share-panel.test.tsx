// @vitest-environment jsdom
/**
 * 分享面板（票券 20，§10）—— 即時連結是面板上**唯一可以建立**的東西（凍結連結是匯出 PDF 的副產品）；
 * 編劇自己的清單看得到凍結連結的漂移（對讀者零洩漏的那一側）；停用保留紀錄、重新分享是新的網址。
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SharePanel, type SharedLinkSummary } from "./SharePanel";

afterEach(cleanup);

const live: SharedLinkSummary = { shareId: "sh_live", token: "tok-live", delivery: null };
const frozen = (changedSince: boolean): SharedLinkSummary => ({
  shareId: "sh_frozen",
  token: "tok-frozen",
  delivery: { deliveredAt: new Date("2026-10-20T06:30:00Z"), changedSince },
});

function mount(initial: SharedLinkSummary[]) {
  let links = [...initial];
  const list = vi.fn(async () => links);
  const shareLive = vi.fn(async () => {
    links = [live, ...links];
    return true;
  });
  const revoke = vi.fn(async (shareId: string) => {
    links = links.filter((l) => l.shareId !== shareId);
    return true;
  });
  render(
    <SharePanel list={list} shareLive={shareLive} revoke={revoke} urlOf={(token) => `https://x.test/s/${token}`} />,
  );
  return { list, shareLive, revoke };
}

const openPanel = () => act(async () => void fireEvent.click(screen.getByRole("button", { name: "分享" })));
const dialog = () => screen.getByRole("dialog", { name: "分享" });

describe("分享面板", () => {
  it("還沒有即時連結：按「建立即時連結」才鑄，鑄好給一格唯讀網址", async () => {
    const { shareLive } = mount([]);
    await openPanel();
    expect(within(dialog()).queryByRole("textbox")).toBeNull();

    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "建立即時連結" })));

    expect(shareLive).toHaveBeenCalledTimes(1);
    const url = within(dialog()).getByRole("textbox", { name: "即時連結" }) as HTMLInputElement;
    expect(url.value).toBe("https://x.test/s/tok-live");
    expect(url.readOnly).toBe(true);
  });

  it("交付的連結列出交付時間；交付之後劇本又改過才說「之後劇本已有修改」", async () => {
    mount([frozen(true)]);
    await openPanel();
    const item = within(dialog()).getByRole("listitem");
    expect(item.textContent).toMatch("2026-10-20 14:30 交付");
    expect(item.textContent).toMatch("之後劇本已有修改");

    cleanup();
    mount([frozen(false)]);
    await openPanel();
    expect(within(dialog()).getByRole("listitem").textContent).not.toMatch("之後劇本已有修改");
  });

  it("停用要按兩次（確認）；停用之後那條從清單上消失，即時連結可以再建一條新的", async () => {
    const { revoke } = mount([live]);
    await openPanel();

    fireEvent.click(within(dialog()).getByRole("button", { name: "停用" }));
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "確定停用" })));

    expect(revoke).toHaveBeenCalledWith("sh_live");
    expect(within(dialog()).queryByRole("textbox", { name: "即時連結" })).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "建立即時連結" })).toBeTruthy();
  });
});
