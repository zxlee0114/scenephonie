import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { DELIVERY_PAYLOAD_VERSION, type DeliveredScene, type DeliveryPayload } from "@scenephonie/schema";

import { chromiumExecutable, printPdf } from "./print-pdf";
import { DEFAULT_EXPORT_OPTIONS } from "./export-options";
import { renderDeliveryHtml } from "./render-html";

/**
 * 真的開一個 Chromium 印一份 fixture 交付（票券 18）。驗的是「印得出來、字抽得回來」：
 * 頁碼跨頁連續、頁尾時間戳是交付的建立時間、CJK 走的是 self-host 的字型（抽得出中文）。
 * 排版好不好看不在這裡驗。
 *
 * 找不到可用的 Chromium 就整組跳過（同 `DATABASE_URL` 的做法）—— 本機用裝好的 Chrome，
 * Linux 用 `@sparticuz/chromium`，或用 `CHROMIUM_EXECUTABLE_PATH` 指定。
 */
const executable = await chromiumExecutable();

const createdAt = new Date("2026-10-22T06:30:00Z");

const scene = (n: number, overrides: Partial<DeliveredScene> = {}): DeliveredScene => ({
  sceneId: `sc_${n}`,
  label: String(n),
  intExt: "內景",
  time: "夜",
  locations: [{ name: "阿強家客廳", displayName: "阿強家客廳" }],
  appearingCharacters: [],
  extras: "",
  ...overrides,
});

/** 夠長、會跨好幾頁的一份稿。 */
function longPayload(): DeliveryPayload {
  const scenes = Array.from({ length: 40 }, (_, i) => scene(i + 1));
  return {
    version: DELIVERY_PAYLOAD_VERSION,
    scenes,
    script: scenes.flatMap((s) => [
      { type: "heading" as const, sceneId: s.sceneId },
      { type: "action" as const, text: "阿強推門進來，屋裡一片漆黑。他摸索著牆上的開關，燈卻怎麼也不亮。" },
      { type: "dialogue" as const, speaker: "阿強", voiceStyle: "一般" as const, text: "有人在嗎？" },
      { type: "dialogue" as const, speaker: "小明", voiceStyle: "V.O." as const, text: "我一直都在。" },
    ]),
  };
}

/** 每一頁的文字項（PDF 裡一段連續排出的字一項；頁尾的頁碼是自己一項）。 */
async function pageItems(pdf: Uint8Array): Promise<string[][]> {
  const doc = await getDocument({ data: pdf.slice() }).promise;
  const pages: string[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).filter(Boolean));
  }
  return pages;
}

const pageTexts = async (pdf: Uint8Array) => (await pageItems(pdf)).map((items) => items.join(""));

describe.skipIf(!executable)("printPdf（需要 Chromium）", () => {
  it("印出多頁 PDF：頁碼逐頁遞增、每頁有交付時間、中文抽得回來", { timeout: 60_000 }, async () => {
    const html = renderDeliveryHtml({ createdAt, payload: longPayload() }, DEFAULT_EXPORT_OPTIONS);
    const pdf = await printPdf(html);

    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const pages = await pageItems(pdf);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((items, i) => {
      expect(items).toContain("2026-10-22 14:30");
      expect(items).toContain(String(i + 1));
    });
    const first = pages[0]!.join("");
    expect(first).toContain("1. 內景 阿強家客廳 夜");
    expect(first).toContain("小明（V.O.）：我一直都在。");
  });

  it("浮水印蓋在每一頁", { timeout: 60_000 }, async () => {
    const watermark = "僅供第48屆優良電影劇本獎評審使用";
    const html = renderDeliveryHtml({ createdAt, payload: longPayload() }, { ...DEFAULT_EXPORT_OPTIONS, watermark });
    const pages = await pageTexts(await printPdf(html));
    expect(pages.length).toBeGreaterThan(1);
    for (const text of pages) expect(text).toContain(watermark);
  });
});
