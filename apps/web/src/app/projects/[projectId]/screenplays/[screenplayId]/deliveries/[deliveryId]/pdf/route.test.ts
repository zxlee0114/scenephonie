/**
 * 一筆交付的 PDF（票券 18）。這支端點只做三件事：過 gate、讀那一筆交付、照選項印。
 *
 * - **gate 在前**（不變式 H）：不是你的劇本、網址的專案對不上、交付不在這份劇本底下 —— 全部是
 *   同一個 404，而且在碰渲染之前就回頭。
 * - **讀的是交付，不是 live doc**（§9.2）：重印 ＝ 同一筆交付再印一次，這裡不建立第二筆。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELIVERY_PAYLOAD_VERSION } from "@scenephonie/schema";

const authorizeScreenplay = vi.hoisted(() => vi.fn());
const loadDelivery = vi.hoisted(() => vi.fn());
const createDelivery = vi.hoisted(() => vi.fn());
const printPdf = vi.hoisted(() => vi.fn());
vi.mock("@/authorization", () => ({ authorizeScreenplay }));
vi.mock("@/persistence", () => ({ loadDelivery, createDelivery }));
vi.mock("@/pdf/print-pdf", () => ({ printPdf }));

const { GET } = await import("./route");

const granted = { screenplayId: "sp_x", projectId: "pj_x", ownerId: "usr_owner" };
const delivery = {
  deliveryId: "dl_1",
  createdAt: new Date("2026-10-22T06:30:00Z"),
  payload: {
    version: DELIVERY_PAYLOAD_VERSION,
    scenes: [
      {
        sceneId: "sc_1",
        label: "1",
        intExt: "內景",
        time: "夜",
        locations: [{ name: "客廳", displayName: "客廳" }],
        appearingCharacters: [{ name: "小明", displayName: "小明" }],
        extras: "",
      },
    ],
    script: [{ type: "heading", sceneId: "sc_1" }],
  },
};

const get = (query = "", params = { projectId: "pj_x", screenplayId: "sp_x", deliveryId: "dl_1" }) =>
  GET(new Request(`http://localhost/projects/pj_x/screenplays/sp_x/deliveries/dl_1/pdf${query}`), {
    params: Promise.resolve(params),
  });

/** 交給印表機的那份 HTML。 */
const printedHtml = (): string => printPdf.mock.calls.at(-1)![0] as string;

beforeEach(() => {
  vi.clearAllMocks();
  authorizeScreenplay.mockResolvedValue(granted);
  loadDelivery.mockResolvedValue(delivery);
  printPdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7"));
});

describe("交付 PDF 端點的門", () => {
  it("不是你的劇本 → 404，不讀交付、不印", async () => {
    authorizeScreenplay.mockResolvedValue(null);

    expect((await get()).status).toBe(404);
    expect(loadDelivery).not.toHaveBeenCalled();
    expect(printPdf).not.toHaveBeenCalled();
  });

  it("網址的專案與劇本真正所屬的專案對不上 → 404（同 layout 的規則）", async () => {
    const response = await get("", { projectId: "pj_other", screenplayId: "sp_x", deliveryId: "dl_1" });

    expect(response.status).toBe(404);
    expect(printPdf).not.toHaveBeenCalled();
  });

  it("交付不在這份劇本底下（或不存在）→ 404，不印", async () => {
    loadDelivery.mockResolvedValue(null);

    expect((await get()).status).toBe(404);
    expect(loadDelivery).toHaveBeenCalledWith(granted, "dl_1");
    expect(printPdf).not.toHaveBeenCalled();
  });
});

describe("交付 PDF 端點：印", () => {
  it("回一份 PDF；讀的是那一筆交付，不建立新的", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("%PDF-1.7");
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it("沒給選項就是預設：不印登場人物、印時間戳、不壓浮水印", async () => {
    await get();

    expect(printedHtml()).not.toContain("人物：小明");
    expect(printedHtml()).toContain("2026-10-22 14:30");
    expect(printedHtml()).not.toContain('class="watermark"');
  });

  it("選項從網址來：浮水印文字、登場人物打開、時間戳關掉", async () => {
    const watermark = "僅供第48屆優良電影劇本獎評審使用";
    await get(`?watermark=${encodeURIComponent(watermark)}&characters=1&timestamp=0`);

    expect(printedHtml()).toContain(watermark);
    expect(printedHtml()).toContain("人物：小明");
    expect(printedHtml()).not.toContain("2026-10-22 14:30");
  });
});
