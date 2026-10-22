/**
 * 台北時間的年月日時分。劇本的讀者在台灣，伺服器跑在 UTC —— 頁尾時間戳與檔名都照這個印。
 */
export function taipeiParts(date: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
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
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour!, minute: parts.minute! };
}
