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

import { ExportPdf } from "./export-pdf";

const pdfBlob = new Blob(["%PDF-1.7"], { type: "application/pdf" });

function mount({
  flush = vi.fn(async () => true),
  createDelivery = vi.fn(async (): Promise<string | null> => "dl_1"),
}: {
  flush?: () => Promise<boolean>;
  createDelivery?: () => Promise<string | null>;
} = {}) {
  const pdfUrl = vi.fn((deliveryId: string, query: string) => `/pdf/${deliveryId}?${query}`);
  render(<ExportPdf flush={flush} createDelivery={createDelivery} pdfUrl={pdfUrl} />);
  return { flush, createDelivery, pdfUrl };
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "匯出 PDF" }));
const checkbox = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const watermarkBox = () => screen.getByRole("textbox", { name: /浮水印/ }) as HTMLInputElement;
const submit = () => act(async () => void fireEvent.click(screen.getByRole("button", { name: "匯出" })));

let fetchMock: ReturnType<typeof vi.fn>;
let downloads: string[];

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(pdfBlob, { status: 200 }));
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
    fetchMock.mockImplementation(async () => (order.push("print"), new Response(pdfBlob)));

    open();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(order).toEqual(["flush", "deliver", "print"]);
    expect(pdfUrl).toHaveBeenCalledWith("dl_1", expect.any(String));
    expect(fetchMock).toHaveBeenCalledWith("/pdf/dl_1?" + pdfUrl.mock.calls[0]![1]);
    expect(downloads[0]).toBe("dl_1.pdf");
  });

  it("選項預設：登場人物不勾、時間戳勾著、浮水印空白；改過的選項跟著網址走", async () => {
    const { pdfUrl } = mount();
    open();

    expect(checkbox(/登場人物/).checked).toBe(false);
    expect(checkbox(/時間戳/).checked).toBe(true);
    expect(watermarkBox().value).toBe("");

    fireEvent.change(watermarkBox(), { target: { value: "僅供第48屆優良電影劇本獎評審使用" } });
    fireEvent.click(checkbox(/登場人物/));
    fireEvent.click(checkbox(/時間戳/));
    await submit();

    await waitFor(() => expect(pdfUrl).toHaveBeenCalled());
    const query = new URLSearchParams(pdfUrl.mock.calls[0]![1]);
    expect(query.get("watermark")).toBe("僅供第48屆優良電影劇本獎評審使用");
    expect(query.get("characters")).toBe("1");
    expect(query.get("timestamp")).toBe("0");
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
