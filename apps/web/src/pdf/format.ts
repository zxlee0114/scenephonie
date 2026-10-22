/**
 * 列印格式 —— 「換格式 ＝ 換模板」（§9.1、§9.8）。
 *
 * 一種格式就是這些維度的一組值：頁面設定、場次標題怎麼寫、動作要不要符號、對白怎麼排、空幾行。
 * 渲染器只照著這裡印，不認識任何一個獎。**v1 只有 GHSA 一種**（§9.3–9.5）；置中分行式、
 * TNUA 的 △ 與人物欄、TFC 的頁面數字都是日後再填一組值 —— 現在先不做第二組。
 */
export interface PrintFormat {
  page: {
    /** CSS `@page size`。 */
    size: string;
    /** CSS `@page margin`。 */
    margin: string;
    /** 內文字級。 */
    fontSize: string;
    lineHeight: number;
    /** 頁尾（頁碼、時間戳）的字級。 */
    footerFontSize: string;
  };
  heading: {
    /** 場次號之後接什麼：主場次 `1.` ＋半形空白；子場次 `5.1` ＋全形空白（`5.1.` 兩個點難讀）。 */
    numberSuffix: { scene: string; subscene: string };
    bold: boolean;
    /** 場次標題之前空幾行（以行高計）。 */
    linesBefore: number;
    /** 場次標題與這一場第一段之間空幾行。 */
    linesAfter: number;
  };
  action: {
    /** 動作前的符號（TNUA 的 `△`）。空字串＝純段落。 */
    prefix: string;
  };
  dialogue: {
    /** v1 只有行內式（§9.5）；置中分行式是日後的另一個值。 */
    layout: "inline";
    /** 人物名與對白之間。 */
    separator: string;
  };
  /** 元素之間空幾行（動作與動作、整段對白與前後動作）。連續的對白之間不空行。 */
  linesBetween: number;
}

/**
 * GHSA 優良電影劇本獎（與 BAMID 附件那份 4 頁範本實質等同）。
 *
 * 硬性的只有兩條：直式橫書繁中、**12 級字**。A4 是跨來源一致；字型／行高／邊界 GHSA 沒規定，
 * 由模板選定（§9.3 建議初值）—— 不得拿 TNUA／TFC 的數字冒充。
 *
 * 場標粗體、場標下一行直接接內文：照範本實物（使用者驗收 2026-10-22 對照範本裁定，推翻 §9.4
 * 「不粗體」—— 那一條原本就是從 PDF 圖像判讀、信心中等）。
 */
export const GHSA: PrintFormat = {
  page: { size: "A4", margin: "2cm", fontSize: "12pt", lineHeight: 1.5, footerFontSize: "9pt" },
  heading: { numberSuffix: { scene: ". ", subscene: "　" }, bold: true, linesBefore: 2, linesAfter: 0 },
  action: { prefix: "" },
  dialogue: { layout: "inline", separator: "：" },
  linesBetween: 1,
};
