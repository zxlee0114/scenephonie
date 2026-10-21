import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import chromium from "@sparticuz/chromium";
import puppeteer, { type LaunchOptions } from "puppeteer-core";

/**
 * 把模板印好的 HTML 交給 Chromium，一趟 `page.pdf()` 印成一份 PDF（票券 18，§9.1）。
 *
 * 這裡不認識劇本、不認識交付 —— 那些都在 `render-html.ts` 印成字了。它只負責「瀏覽器在哪、
 * 字型從哪來、等字型到齊再印」。
 *
 * **字型不賭執行環境**：Lambda 上沒有任何 CJK 字型（`@sparticuz/chromium` 只帶 Open Sans），
 * 所以頁面是掛在一個假的 origin 上，字型請求由這裡從 `public/` 讀檔回應 —— 本機與正式環境印出來
 * 是同一套 self-host 的 Noto Sans TC subset（票券 29）。除了那個 origin 上的檔案，**一律不准出網**：
 * 印的內容是使用者寫的字，頁面不該有能力替任何人發請求。
 *
 * ⚠️ Cloudflare Workers 純執行模式跑不動這支（每個 Worker 只有 10 MiB，§9.1 硬邊界）。
 */

const ORIGIN = "https://print.scenephonie.invalid";
const PUBLIC_DIR = path.join(process.cwd(), "public");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
};

/** macOS／Linux 開發機上常見的 Chrome 位置（本機開發與測試用）。 */
const LOCAL_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

/** Linux 上沒有指定、也沒有裝 Chrome ＝ Vercel／Lambda：用 `@sparticuz/chromium` 解壓出來的那一顆。 */
const usesSparticuz = () =>
  process.platform === "linux" && !process.env.CHROMIUM_EXECUTABLE_PATH && !LOCAL_CHROME.some(existsSync);

/**
 * 找一個可以用的 Chromium：`CHROMIUM_EXECUTABLE_PATH` 優先；Vercel／Lambda 用 `@sparticuz/chromium`；
 * 其餘找本機裝好的 Chrome。都沒有就是 `null`。
 */
export async function chromiumExecutable(): Promise<string | null> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH;
  if (usesSparticuz()) return chromium.executablePath();
  return LOCAL_CHROME.find(existsSync) ?? null;
}

async function launchOptions(): Promise<LaunchOptions> {
  const executablePath = await chromiumExecutable();
  if (!executablePath) throw new Error("找不到可以印 PDF 的 Chromium");
  if (!usesSparticuz()) return { executablePath, headless: true };
  return {
    executablePath,
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    headless: "shell",
  };
}

/** 印一份 PDF。頁面設定（紙張、邊界、頁碼、時間戳）全在 HTML 的 `@page` 裡，這裡不另給。 */
export async function printPdf(html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch(await launchOptions());
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void respond(request.url(), html).then(
        (response) => (response ? request.respond(response) : request.abort("blockedbyclient")),
        () => request.abort("failed"),
      );
    });
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle0" });
    // unicode-range 的字型塊是排版時才按需要拉的 —— 等它們全部到齊再印，不然印出來是後備字型。
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}

async function respond(url: string, html: string) {
  const { origin, pathname } = new URL(url);
  if (origin !== ORIGIN) return null;
  if (pathname === "/") return { status: 200, contentType: "text/html; charset=utf-8", body: html };

  // 只送 `public/fonts/` 底下的檔案；`..` 走不出去。
  const file = path.join(PUBLIC_DIR, path.normalize(pathname));
  const contentType = CONTENT_TYPES[path.extname(file)];
  if (!file.startsWith(path.join(PUBLIC_DIR, "fonts") + path.sep) || !contentType) return null;
  return { status: 200, contentType, body: await readFile(file) };
}
