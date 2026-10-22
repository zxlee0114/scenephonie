/**
 * 匯出選項 —— **渲染的參數，不是交付的內容**（票券 18）：同一筆交付換個選項重印，承諾的字
 * （場次號、內文）一個都不變。所以它們不進 `deliveries`，走的是 PDF 網址的 query。
 *
 * 編碼與解碼住在同一個檔案：匯出按鈕寫、route 讀，兩邊不會各說各話。這個檔案沒有伺服器相依，
 * client 端 import 得起。
 */
export interface ExportOptions {
  /** 浮水印文字（GHSA 強制、含屆別，每屆不同）。空字串＝不壓。 */
  watermark: string;
  /** 場次標題下印登場人物。預設關（GHSA 範本 2022-02-26 改版已拿掉人物欄）。 */
  appearingCharacters: boolean;
  /** 每頁頁尾靠左印交付的建立時間。預設開，投稿前可關。 */
  timestamp: boolean;
  /** 內文字型。預設楷體（GHSA 範本實物用標楷體）；黑體給偏好無襯線的人。 */
  font: PrintFont;
}

/** `kai` ＝全字庫正楷體（標楷體的開放授權替身）；`sans` ＝ Noto Sans TC（正黑／蘋方的開源對應）。 */
export type PrintFont = "kai" | "sans";
const PRINT_FONTS: readonly PrintFont[] = ["kai", "sans"];

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  watermark: "",
  appearingCharacters: false,
  timestamp: true,
  font: "kai",
};

export function exportOptionsToQuery(options: ExportOptions): string {
  const query = new URLSearchParams();
  if (options.watermark.trim()) query.set("watermark", options.watermark.trim());
  query.set("characters", options.appearingCharacters ? "1" : "0");
  query.set("timestamp", options.timestamp ? "1" : "0");
  query.set("font", options.font);
  return query.toString();
}

/** 網址上的匯出選項；沒給的那一項用預設。 */
export function exportOptionsFromQuery(query: URLSearchParams): ExportOptions {
  const flag = (name: string, fallback: boolean) => {
    const value = query.get(name);
    return value === null ? fallback : value === "1";
  };
  return {
    watermark: query.get("watermark") ?? DEFAULT_EXPORT_OPTIONS.watermark,
    appearingCharacters: flag("characters", DEFAULT_EXPORT_OPTIONS.appearingCharacters),
    timestamp: flag("timestamp", DEFAULT_EXPORT_OPTIONS.timestamp),
    font: PRINT_FONTS.find((font) => font === query.get("font")) ?? DEFAULT_EXPORT_OPTIONS.font,
  };
}
