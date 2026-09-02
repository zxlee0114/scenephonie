import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import preload from "../../public/fonts/noto-sans-tc/preload.json";

export const metadata: Metadata = {
  title: "Scenephonie",
  description: "結構化劇本創作平台",
};

/*
 * 字型載入（票券 29）：self-host Noto Sans TC 400，靜態 105 塊 unicode-range subset。
 *
 * - fonts.css（105 個 @font-face、font-display: swap）由 public/ 靜態送出，`url('./NNN.woff2')`
 *   自然相對到同目錄，不進 bundler。產生方式見 apps/web/scripts/fonts/README.md。
 * - <head> preload 最高頻數塊（build 時寫進 preload.json）—— 首屏就讓九成字元有字型，把
 *   「打字中換字型」的機率壓到個位數百分比。其餘塊由瀏覽器按 unicode-range 需求自行拉。
 */
const FONT_DIR = "/fonts/noto-sans-tc";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="stylesheet" href={`${FONT_DIR}/fonts.css`} />
        {preload.files.map((name) => (
          <link
            key={name}
            rel="preload"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
            href={`${FONT_DIR}/${name}.woff2`}
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
