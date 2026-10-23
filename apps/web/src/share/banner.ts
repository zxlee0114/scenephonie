import { taipeiParts } from "@/pdf/taipei-time";

/**
 * 分享頁頂固定的那一行（票券 20，§10.1、§10.2）。
 *
 * - **即時**：「即時連結 · 最後更新於 X」。價值不在資訊量，在**讓漂移變得可察覺** —— PDF 有實體
 *   差異可察覺，活連結什麼都沒有。X 是 canonical state 最後一次推進的時間（「變了沒」的判準住在
 *   persistence，時間只是它的人類可讀投影）。
 * - **凍結**：「這是 X 時交付的版本」。**只說交付的時刻** —— 不對被刻意凍結的受眾說「作者後來
 *   又改了」，那是洩漏 current state（投獎與交件情境下是明確的害處）。型別上它就拿不到那個資訊。
 */
export type ShareBannerInput = { kind: "live"; updatedAt: Date } | { kind: "frozen"; deliveredAt: Date };

export function shareBanner(input: ShareBannerInput): string {
  return input.kind === "live"
    ? `即時連結 · 最後更新於 ${minuteText(input.updatedAt)}`
    : `這是 ${minuteText(input.deliveredAt)} 交付的版本`;
}

/** 台北時間 `2026-10-22 14:30` —— 讀者在台灣，伺服器跑在 UTC（同 PDF 頁尾）。 */
export function minuteText(date: Date): string {
  const { year, month, day, hour, minute } = taipeiParts(date);
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
