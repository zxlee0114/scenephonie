// @vitest-environment jsdom
/**
 * 分享面板（票券 20，§10）—— 即時連結是面板上**唯一可以建立**的東西（凍結連結是匯出 PDF 的副產品）；
 * 編劇自己的清單看得到凍結連結的漂移（對讀者零洩漏的那一側）；停用保留紀錄、重新分享是新的網址。
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SharePanel, type SharedLinkSummary } from "./SharePanel";

afterEach(cleanup);

const live: SharedLinkSummary = { shareId: "sh_live", token: "tok-live", note: null, delivery: null };
const frozen = (changedSince: boolean, n = 0): SharedLinkSummary => ({
  shareId: `sh_frozen${n}`,
  token: `tok-frozen${n}`,
  note: null,
  delivery: { deliveredAt: new Date(Date.UTC(2026, 9, 20, 6, 30 + n)), changedSince },
});

function mount(initial: SharedLinkSummary[], { saved = true } = {}) {
  let links = [...initial];
  const list = vi.fn(async () => links);
  const shareLive = vi.fn(async () => {
    links = [live, ...links];
    return true;
  });
  const flush = vi.fn(async () => saved);
  const shareSnapshot = vi.fn(async () => {
    links = [...links, frozen(false)];
    return true;
  });
  const revoke = vi.fn(async (shareIds: string[]) => {
    links = links.filter((l) => !shareIds.includes(l.shareId));
    return true;
  });
  const setNote = vi.fn(async (shareId: string, note: string) => {
    links = links.map((l) => (l.shareId === shareId ? { ...l, note: note.trim() || null } : l));
    return true;
  });
  render(
    <SharePanel
      list={list}
      shareLive={shareLive}
      flush={flush}
      shareSnapshot={shareSnapshot}
      revoke={revoke}
      setNote={setNote}
      urlOf={(token) => `https://x.test/s/${token}`}
    />,
  );
  return { list, shareLive, flush, shareSnapshot, revoke, setNote };
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

    expect(revoke).toHaveBeenCalledWith(["sh_live"]);
    expect(within(dialog()).queryByRole("textbox", { name: "即時連結" })).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "建立即時連結" })).toBeTruthy();
  });

  it("「複製」把網址放進剪貼簿，鈕上換成「已複製」", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount([live]);
    await openPanel();

    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "複製" })));

    expect(writeText).toHaveBeenCalledWith("https://x.test/s/tok-live");
    expect(within(dialog()).getByRole("button", { name: "已複製" })).toBeTruthy();
  });

  it("「建立交付連結」先存檔，再用那一刻的存檔建交付連結；存不進去就不建", async () => {
    const { flush, shareSnapshot } = mount([]);
    await openPanel();

    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "建立交付連結" })));

    expect(flush).toHaveBeenCalledTimes(1);
    expect(shareSnapshot).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole("textbox", { name: "2026-10-20 14:30 交付" })).toBeTruthy();

    cleanup();
    const unsaved = mount([], { saved: false });
    await openPanel();
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "建立交付連結" })));

    expect(unsaved.shareSnapshot).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole("alert")).toBeTruthy();
  });

  it("勾選幾條交付連結，一鍵停用（要確認）；全選勾起全部", async () => {
    const { revoke } = mount([frozen(false, 0), frozen(false, 1), frozen(false, 2)]);
    await openPanel();
    expect(within(dialog()).queryByRole("button", { name: /停用所選/ })).toBeNull();

    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "選取 2026-10-20 14:30 交付" }));
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "選取 2026-10-20 14:32 交付" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "停用所選（2）" }));
    expect(revoke).not.toHaveBeenCalled();
    expect(within(dialog()).getByText("將停用 2 條交付連結，停用之後連結將會失效")).toBeTruthy();

    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "確定停用" })));
    expect(revoke).toHaveBeenCalledWith(["sh_frozen0", "sh_frozen2"]);
    expect(within(dialog()).getAllByRole("listitem")).toHaveLength(1);

    const all = within(dialog()).getByRole("checkbox", { name: "全選" }) as HTMLInputElement;
    expect(all.checked).toBe(false);
    fireEvent.click(all);
    expect(within(dialog()).getByRole("button", { name: "停用所選（1）" })).toBeTruthy();
  });

  it("備註：離開欄位才存；沒改就不存；讀回來的是存好的那一份", async () => {
    const { setNote } = mount([live]);
    await openPanel();
    const note = within(dialog()).getByRole("textbox", { name: "即時連結的備註" }) as HTMLInputElement;

    fireEvent.blur(note);
    expect(setNote).not.toHaveBeenCalled();

    fireEvent.change(note, { target: { value: "給優良劇本獎評審" } });
    await act(async () => void fireEvent.blur(note));

    expect(setNote).toHaveBeenCalledWith("sh_live", "給優良劇本獎評審");
    expect((within(dialog()).getByRole("textbox", { name: "即時連結的備註" }) as HTMLInputElement).value).toBe(
      "給優良劇本獎評審",
    );
  });
});
