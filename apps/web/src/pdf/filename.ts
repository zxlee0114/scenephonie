import { taipeiParts } from "./taipei-time";

/**
 * PDF 的檔名：`劇本名稱_20261022-1430.pdf`。時間是**交付的建立時間**，同一筆交付重印檔名不變；
 * 換一次匯出就是另一個檔名，不會蓋掉上一份。劇本名稱眼下是專案名稱（v1 專案與劇本 1:1）。
 */
export function pdfFilename(title: string, createdAt: Date): string {
  const { year, month, day, hour, minute } = taipeiParts(createdAt);
  // Windows／macOS 檔名不收的字，加上控制字元。
  // eslint-disable-next-line no-control-regex
  const safe = title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "劇本";
  return `${safe}_${year}${month}${day}-${hour}${minute}.pdf`;
}

/**
 * `content-disposition` 的值。中文檔名放 `filename*`（RFC 5987）；`filename` 是給不認得它的
 * 客戶端的 ASCII 備援。
 */
export function contentDisposition(filename: string, asciiFallback: string): string {
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
