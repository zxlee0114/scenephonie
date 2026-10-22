import {
  DELIVERY_PAYLOAD_VERSION,
  type DeliveredScene,
  type DeliveryPayload,
  type ScriptElement,
} from "@scenephonie/schema";

import type { ExportOptions, PrintFont } from "./export-options";
import { GHSA as format } from "./format";

/**
 * 交付 → 一份可以直接交給瀏覽器印成 PDF 的 HTML（票券 18，§9.4）。
 *
 * **只讀 payload，只決定印成什麼字**（不變式 E）。場次號、折返該不該印、片段歸誰、同名地點要
 * 補印哪幾欄，全在建立交付時算完了；這裡不准從 payload 回頭重算任何一個。「以下對剪」「回到」
 * 「INS」這些字是模板產物（約束 2），只住在這裡。
 */

/** 渲染器讀得懂的 payload 形狀版本。交付不被遷移 —— 舊形狀出現時，在這裡多一支讀法，不刪舊的。 */
const READABLE_PAYLOAD_VERSIONS: readonly number[] = [DELIVERY_PAYLOAD_VERSION];

/**
 * 字型樣式表。印的那一端（`print-pdf.ts`）從 `public/fonts` 送出 self-host 的 subset —— 本機與
 * Lambda 印出來是同一套字，不賭執行環境裝了什麼字型。
 *
 * 楷體是全字庫正楷體（標楷體是微軟授權，不能放上伺服器嵌進 PDF）。它只收 BMP，缺字落到
 * Noto Sans TC（票券 29 那一份），所以兩份樣式表都掛，楷體排前面。
 */
const FONTS: Record<PrintFont, { stylesheets: string[]; family: string }> = {
  kai: {
    stylesheets: ["/fonts/tw-kai/fonts.css", "/fonts/noto-sans-tc/fonts.css"],
    family: "'TW-Kai', 'Noto Sans TC', serif",
  },
  sans: { stylesheets: ["/fonts/noto-sans-tc/fonts.css"], family: "'Noto Sans TC', sans-serif" },
};

/**
 * @param delivery 一筆已提交的交付。頁尾時間戳印的是它的 `createdAt` —— 不是渲染當下的 now，
 *   否則同一筆交付重印會印出不同的字（§9.2）。
 */
export function renderDeliveryHtml(
  delivery: { createdAt: Date; payload: DeliveryPayload },
  options: ExportOptions,
): string {
  const { payload } = delivery;
  if (!READABLE_PAYLOAD_VERSIONS.includes(payload.version)) {
    throw new Error(`渲染器不認得交付 payload 版本 ${String(payload.version)}`);
  }
  const scenes = new Map(payload.scenes.map((s) => [s.sceneId, s]));
  const body = payload.script.map((element) => renderElement(element, scenes, options)).join("\n");
  const watermark = options.watermark.trim();

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
${FONTS[options.font].stylesheets.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}
<style>${stylesheet(FONTS[options.font].family, options.timestamp ? timestampText(delivery.createdAt) : null)}</style>
</head>
<body>
${watermark ? `<div class="watermark" aria-hidden="true">${escape(watermark)}</div>` : ""}
<section data-section="script">
${body}
</section>
</body>
</html>`;
}

/**
 * 模板的 CSS。頁碼與時間戳掛在 `@page` 的邊界盒（margin box）—— 頁碼因此天然**跨區段連續**
 * （`counter(page)` 是整份文件的計數，不是某個容器的）。浮水印是 `position: fixed` 的一層：
 * 列印時它在每一頁重複，蓋在頁面上而不是某個內文容器裡（§9.7：要蓋滿每個區段）。規格寫「掛
 * `@page`」，要的就是這個性質；Chromium 的 `@page` 不畫背景圖、邊界盒也蓋不到版心，fixed 是
 * 同一件事在 Chromium 上做得到的寫法。
 */
function stylesheet(fontFamily: string, timestamp: string | null): string {
  const { page, heading } = format;
  const line = `${page.lineHeight}em`;
  const gap = (lines: number) => `calc(${lines} * ${line})`;
  const footer = `font-family: ${fontFamily}; font-size: ${page.footerFontSize};`;
  return `
@page {
  size: ${page.size};
  margin: ${page.margin};
  @bottom-center { content: counter(page); ${footer} }
  ${timestamp ? `@bottom-left { content: "${timestamp}"; ${footer} color: #555; }` : ""}
}
html { font-family: ${fontFamily}; font-size: ${page.fontSize}; line-height: ${page.lineHeight}; color: #000; }
body { margin: 0; }
section + section { break-before: page; }
section > * {
  margin: ${gap(format.linesBetween)} 0 0;
  font-size: inherit;
  font-weight: normal;
  /* 軟換行（Shift+Enter 的 \\n）照印；CJK 避頭尾用 strict，長串英數不撐破版心。 */
  white-space: pre-wrap;
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
  orphans: 2;
  widows: 2;
}
section > :first-child { margin-top: 0; }
section > h2 { margin-top: ${gap(heading.linesBefore)}; font-weight: ${heading.bold ? "bold" : "normal"}; break-after: avoid; }
section > h2 + * { margin-top: ${gap(heading.linesAfter)}; }
/* 標題、折返與對剪的標記都在說「接下來這段」—— 不准被留在頁底、跟它說的那段分開。 */
section > .marker { break-after: avoid; }
/* 多句對白連續時中間不空行；整段對白與前後動作各空一行（§9.4）。 */
section > .dialogue + .dialogue { margin-top: 0; }
.watermark {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-30deg);
  font-family: ${fontFamily};
  font-size: 28pt;
  color: rgba(0, 0, 0, 0.12);
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}
`;
}

/** 交付的建立時間，台北時間 `2026-10-22 14:30`。劇本的讀者在台灣，伺服器跑在 UTC。 */
function timestampText(createdAt: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(createdAt)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function renderElement(
  element: ScriptElement,
  scenes: ReadonlyMap<string, DeliveredScene>,
  options: ExportOptions,
): string {
  switch (element.type) {
    case "heading": {
      const scene = sceneOf(element.sceneId, scenes);
      const location = scene.locations.map((r) => r.displayName).join("、");
      const suffix = scene.parentSceneId ? format.heading.numberSuffix.subscene : format.heading.numberSuffix.scene;
      // 群演永遠不進 PDF；登場人物是匯出選項，照 TNUA 接在場標列最後、不加「人物：」（使用者裁決
      // 2026-10-22），印的是這一場的顯示名（編劇在這一場寫的那個名字）。
      const people = options.appearingCharacters ? scene.appearingCharacters.map((r) => r.displayName).join("、") : "";
      // 雜景的地點可以留空 —— 那一欄就不印（使用者裁決 2026-10-22），不補「參照敘述」那種產品用語。
      const meta = [scene.intExt, location, scene.time, people].filter(Boolean).join(" ");
      return `<h2>${escape(scene.label + suffix + meta)}</h2>`;
    }
    case "action":
      return `<p>${escape(format.action.prefix + element.text)}</p>`;
    case "dialogue": {
      // 沒指定說話者就只印對白 —— 補一個名字等於替編劇寫字（匯出前防呆是票 19 的事）。
      const voice = element.voiceStyle === "一般" ? "" : `（${element.voiceStyle}）`;
      const speaker = element.speaker === null ? "" : `${element.speaker}${voice}${format.dialogue.separator}`;
      return `<p class="dialogue">${escape(speaker + element.text)}</p>`;
    }
    case "insertShot":
      return `<p>${escape(`（INS）${element.text}`)}</p>`;
    case "returnTo":
      return `<p class="marker">${escape("回到　" + placeOf(element, scenes))}</p>`;
    case "intercut":
      return `<p class="marker">以下對剪</p>`;
    case "fragment": {
      // 補印哪幾欄是交付算好的（`disambiguateBy`），這裡只把那幾欄的值印進括號。
      const scene = sceneOf(element.sceneId, scenes);
      const extra = element.disambiguateBy.map((field) => scene[field]).join(" ");
      return `<p class="marker">${escape(placeOf(element, scenes) + (extra ? `（${extra}）` : ""))}</p>`;
    }
    default:
      return "";
  }
}

/**
 * 折返與片段標記上的那個「哪裡」。交付給的是地點顯示名；只有雜景能留空地點，那時印那一場的
 * 內外（＝「雜景」）—— 紙上只出現編劇寫過的字與格式本來就有的值（使用者裁決 2026-10-22）。
 */
function placeOf(element: { sceneId: string; location: string | null }, scenes: ReadonlyMap<string, DeliveredScene>) {
  return element.location ?? sceneOf(element.sceneId, scenes).intExt;
}

/** payload 裡元素指到的場次。找不到＝payload 壞了 —— 大聲失敗，不猜著印。 */
function sceneOf(sceneId: string, scenes: ReadonlyMap<string, DeliveredScene>): DeliveredScene {
  const scene = scenes.get(sceneId);
  if (!scene) throw new Error(`交付 payload 的內文指到不存在的場次 ${sceneId}`);
  return scene;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
