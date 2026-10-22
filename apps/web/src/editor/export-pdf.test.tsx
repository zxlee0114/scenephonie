// @vitest-environment jsdom
/**
 * 匯出 PDF 的按鈕（票券 18）。順序是被迫的（§9.2）：
 *
 * 1. **先把手上的存掉** —— 交付承諾的是 canonical state，不是分頁記憶體裡還沒存的那一份。
 *    存不進去就不匯出：印出一份少了剛才那幾個字的 PDF，比不印更糟。
 * 2. **再建立交付** —— 一個交易，回傳那一筆的 id。
 * 3. **再印** —— 讀那一筆交付。印壞了就用**同一筆**重印，不建立第二筆（重試 ≠ 再匯出一次）。
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExportPreflight } from "@scenephonie/schema";

import { ExportPdf } from "./export-pdf";

// 字串不是 Blob：jsdom 的 Blob 交不進 Node 22 內建（undici）的 Response（`object.stream is not a function`）。
const pdfBody = "%PDF-1.7";

const nothingSkipped: ExportPreflight = { drafts: [], skipped: { drafts: 0, groupMates: 0 }, appearing: [] };

function mount({
  flush = vi.fn(async () => true),
  createDelivery = vi.fn(async (): Promise<string | null> => "dl_1"),
  preflight = () => nothingSkipped,
  dismissDraftReminders = vi.fn(),
}: {
  flush?: () => Promise<boolean>;
  createDelivery?: () => Promise<string | null>;
  preflight?: () => ExportPreflight;
  dismissDraftReminders?: (sceneIds: string[]) => void;
} = {}) {
  const pdfUrl = vi.fn((deliveryId: string, query: string) => `/pdf/${deliveryId}?${query}`);
  render(
    <ExportPdf
      flush={flush}
      createDelivery={createDelivery}
      pdfUrl={pdfUrl}
      preflight={preflight}
      dismissDraftReminders={dismissDraftReminders}
    />,
  );
  return { flush, createDelivery, pdfUrl, dismissDraftReminders };
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "匯出 PDF" }));
const checkbox = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;
const watermarkBox = () => screen.getByRole("textbox", { name: /浮水印/ }) as HTMLInputElement;
const submit = () => act(async () => void fireEvent.click(screen.getByRole("button", { name: "匯出" })));

let fetchMock: ReturnType<typeof vi.fn>;
let downloads: string[];

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(pdfBody, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  downloads = [];
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("匯出 PDF", () => {
  it("先存檔、再建立交付、再印那一筆，印好就下載", async () => {
    const order: string[] = [];
    const { pdfUrl } = mount({
      flush: vi.fn(async () => (order.push("flush"), true)),
      createDelivery: vi.fn(async () => (order.push("deliver"), "dl_1")),
    });
    fetchMock.mockImplementation(async () => (order.push("print"), new Response(pdfBody)));

    open();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(order).toEqual(["flush", "deliver", "print"]);
    expect(pdfUrl).toHaveBeenCalledWith("dl_1", expect.any(String));
    expect(fetchMock).toHaveBeenCalledWith("/pdf/dl_1?" + pdfUrl.mock.calls[0]![1]);
    expect(downloads[0]).toBe("dl_1.pdf");
  });

  it("下載的檔名用伺服器給的那一個（劇本名稱_交付時間）", async () => {
    const name = "阿強的夏天_20261022-1430.pdf";
    fetchMock.mockResolvedValue(
      new Response(pdfBody, {
        headers: { "content-disposition": `inline; filename="dl_1.pdf"; filename*=UTF-8''${encodeURIComponent(name)}` },
      }),
    );
    mount();
    open();
    await submit();

    await waitFor(() => expect(downloads).toEqual([name]));
  });

  it("選項預設：登場人物不勾、時間戳勾著、浮水印空白、字型楷體；改過的選項跟著網址走", async () => {
    const { pdfUrl } = mount();
    open();

    expect(checkbox(/登場人物/).checked).toBe(false);
    expect(checkbox(/時間戳/).checked).toBe(true);
    expect(watermarkBox().value).toBe("");
    expect(radio(/楷體/).checked).toBe(true);

    fireEvent.change(watermarkBox(), { target: { value: "僅供第48屆優良電影劇本獎評審使用" } });
    fireEvent.click(checkbox(/登場人物/));
    fireEvent.click(checkbox(/時間戳/));
    fireEvent.click(radio(/黑體/));
    await submit();

    await waitFor(() => expect(pdfUrl).toHaveBeenCalled());
    const query = new URLSearchParams(pdfUrl.mock.calls[0]![1]);
    expect(query.get("watermark")).toBe("僅供第48屆優良電影劇本獎評審使用");
    expect(query.get("characters")).toBe("1");
    expect(query.get("timestamp")).toBe("0");
    expect(query.get("font")).toBe("sans");
  });

  it("存不進去就不匯出 —— 不建立交付，並說出原因", async () => {
    const { createDelivery } = mount({ flush: vi.fn(async () => false) });
    open();
    await submit();

    expect((await screen.findByRole("alert")).textContent).toMatch(/沒存進去/);
    expect(createDelivery).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("建立交付時斷線：說是連線問題、不叫人重新登入，也不印", async () => {
    mount({ createDelivery: vi.fn(async () => Promise.reject(new Error("network"))) });
    open();
    await submit();

    const alert = (await screen.findByRole("alert")).textContent;
    expect(alert).toMatch(/連線/);
    expect(alert).not.toMatch(/登入/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("印壞了：「再印一次」用同一筆交付重印，不建立第二筆", async () => {
    const { createDelivery } = mount();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    open();
    await submit();

    expect((await screen.findByRole("alert")).textContent).toMatch(/沒有印出來/);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "再印一次" })));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(createDelivery).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe(fetchMock.mock.calls[0]![0]);
  });
});

/**
 * 匯出前防呆（票券 19，§9.6）—— 面板的語意是「這份 PDF 會少掉這幾場」，不是「要不要輸出這一場」。
 * 清單只提醒、不擋：按「匯出」照樣印。
 */
describe("匯出前防呆", () => {
  const twoDrafts: ExportPreflight = {
    drafts: [
      {
        sceneId: "sc_a",
        label: "S11[D1]",
        excerpt: "小明在雨中奔跑",
        reasons: [{ kind: "missingMeta", fields: ["intExt", "location"] }],
      },
      {
        sceneId: "sc_b",
        label: "S2[D1]",
        excerpt: "她接起電話",
        reasons: [{ kind: "manual" }],
        group: { groupMates: ["2", "2.1"] },
      },
    ],
    skipped: { drafts: 2, groupMates: 2 },
    appearing: [],
  };
  const draftList = () => screen.getByRole("group", { name: /會略過/ });

  it("列出被略過的草稿：標籤、內容首行、缺了哪幾欄；草稿成員說出整組印不出來", () => {
    mount({ preflight: () => twoDrafts });
    open();

    const list = draftList();
    expect(list.textContent).toMatch(/本次輸出會略過 2 場草稿/);
    expect(checkbox(/S11\[D1\]/).closest("li")!.textContent).toMatch(/「小明在雨中奔跑」.*未填寫內／外、地點/);
    const member = checkbox(/S2\[D1\]/).closest("li")!.textContent;
    expect(member).toMatch(/手動標記為草稿/);
    expect(member).toMatch(/這場屬於一個對剪群組/);
    expect(member).toMatch(/2、2\.1/);
  });

  it("多選與全選；「之後不再提醒」只記勾了的那幾場（sceneId）", () => {
    const { dismissDraftReminders } = mount({ preflight: () => twoDrafts });
    open();
    const remember = () => screen.getByRole("button", { name: "之後不再提醒勾選的場次" }) as HTMLButtonElement;

    expect(remember().disabled).toBe(true);
    fireEvent.click(checkbox(/S2\[D1\]/));
    fireEvent.click(remember());
    expect(dismissDraftReminders).toHaveBeenLastCalledWith(["sc_b"]);

    fireEvent.click(checkbox(/全選/));
    expect(checkbox(/S11\[D1\]/).checked).toBe(true);
    expect(checkbox(/S2\[D1\]/).checked).toBe(true);
    fireEvent.click(remember());
    expect(dismissDraftReminders).toHaveBeenLastCalledWith(["sc_a", "sc_b"]);
  });

  it("不再提醒之後清單重讀：記下的那幾場不再列", () => {
    let current = twoDrafts;
    mount({
      preflight: () => current,
      dismissDraftReminders: (ids) => {
        current = { ...current, drafts: current.drafts.filter((d) => !ids.includes(d.sceneId)) };
      },
    });
    open();
    fireEvent.click(checkbox(/S11\[D1\]/));
    fireEvent.click(screen.getByRole("button", { name: "之後不再提醒勾選的場次" }));

    expect(screen.queryByRole("checkbox", { name: /S11\[D1\]/ })).toBeNull();
    expect(checkbox(/S2\[D1\]/).checked).toBe(false);
  });

  it("即使全部設成不再提醒，匯出完成後仍說「本次略過 N 場草稿」—— 不擋、不需點掉", async () => {
    mount({ preflight: () => ({ drafts: [], skipped: { drafts: 2, groupMates: 1 }, appearing: [] }) });
    open();
    expect(screen.queryByRole("group", { name: /會略過/ })).toBeNull();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    const done = screen.getByRole("status").textContent;
    expect(done).toMatch(/已下載/);
    expect(done).toMatch(/本次略過 2 場草稿/);
    expect(done).toMatch(/另有 1 場/);
  });

  it("沒有略過任何一場就不說", async () => {
    mount();
    open();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(screen.getByRole("status").textContent).not.toMatch(/略過/);
  });

  it("登場人物提示另外列，不阻擋匯出", async () => {
    mount({
      preflight: () => ({
        ...nothingSkipped,
        appearing: [{ sceneId: "sc_c", label: "3", speakers: ["小明", "小華"] }],
      }),
    });
    open();

    const reminder = screen.getByRole("group", { name: /登場人物/ });
    expect(reminder.textContent).toMatch(/3.*小明、小華/);
    expect(reminder.querySelector("input")).toBeNull();
    await submit();
    await waitFor(() => expect(downloads).toHaveLength(1));
  });
});
