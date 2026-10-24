import Link from "next/link";
import type { ReactNode } from "react";

/**
 * hub 上的一張卡（票券 21 驗收，2026-10-24）：寬螢幕排成卡片網格，手機寬度變回一列一項的清單 ——
 * 同一份標記，版面交給 CSS（`app.css` 的 `.hub-card`）。
 *
 * 整張卡都點得到：連結的 `::after` 撐滿整張卡。卡上的動作（刪除）疊在連結之上，不包在連結裡 ——
 * 按鈕不能放進 `<a>`。沒有 `href` 的卡是還沒開放的那一份（人物介紹），只佔著位置。
 */
export function DocumentCard({
  href,
  name,
  meta,
  action,
}: {
  href?: string;
  name: string;
  /** 名字下面那一行淡字：最後編輯時間、字數，或「尚未開始」。 */
  meta: string;
  action?: ReactNode;
}) {
  return (
    <li className={href ? "hub-card" : "hub-card hub-card--pending"}>
      {href ? (
        <Link href={href} className="hub-card__name">
          {name}
        </Link>
      ) : (
        <span className="hub-card__name">{name}</span>
      )}
      <span className="hub-card__meta">{meta}</span>
      {action}
    </li>
  );
}

const EDITED_DATE = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "long" });

/**
 * 卡片上那一行：「2026年10月24日 · 1,234 字」。日期照台北時間（讀者在台灣、伺服器跑在 UTC，同 PDF 頁尾）。
 * 還沒打開過的固定文件沒有資料，就說「尚未開始」。
 */
export function cardMeta(edited: { updatedAt: Date; words?: number } | undefined): string {
  if (!edited) return "尚未開始";
  const date = EDITED_DATE.format(edited.updatedAt);
  return edited.words === undefined ? date : `${date} · ${edited.words.toLocaleString("en-US")} 字`;
}
