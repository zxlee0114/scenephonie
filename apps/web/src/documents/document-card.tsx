import Link from "next/link";
import type { ReactNode } from "react";

/**
 * hub 上的一張卡（票券 21 驗收，2026-10-24）：寬螢幕排成卡片網格，手機寬度變回一列一項的清單 ——
 * 同一份標記，版面交給 CSS（`app.css` 的 `.hub-card`）。
 *
 * 卡片上半是內文開頭幾個字的預覽 —— 「未命名文件」有好幾份時，那是唯一認得出哪一份的線索；
 * 還沒有字的（空白、還沒打開過）放一個淡淡的檔案圖示佔位。手機的清單版面不顯示預覽。
 *
 * 整張卡都點得到：連結的 `::after` 撐滿整張卡。卡上的動作（刪除）疊在連結之上，不包在連結裡 ——
 * 按鈕不能放進 `<a>`。
 */
export function DocumentCard({
  href,
  name,
  meta,
  excerpt = "",
  action,
}: {
  href: string;
  name: string;
  /** 內文開頭幾個字；空字串就放圖示。 */
  excerpt?: string;
  /** 名字下面那一行淡字：最後編輯時間、字數，或「尚未開始」。 */
  meta: string;
  action?: ReactNode;
}) {
  return (
    <li className="hub-card">
      <span className="hub-card__preview" aria-hidden="true">
        {excerpt || <FileIcon />}
      </span>
      <Link href={href} className="hub-card__name">
        {name}
      </Link>
      <span className="hub-card__meta">{meta}</span>
      {action}
    </li>
  );
}

/** 還沒有字可以預覽時的佔位：一張摺角的紙。顏色跟著文字（currentColor）。 */
function FileIcon() {
  return (
    <svg className="hub-card__icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinejoin="round" />
    </svg>
  );
}

const EDITED_DATE = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "long" });

/**
 * 卡片上那一行：「2026年10月24日 · 1,234 字」。日期照台北時間（讀者在台灣、伺服器跑在 UTC，同 PDF 頁尾）。
 * 一個字都還沒有就說「尚未開始」—— 判準是**有沒有字**，不是文件存不存在（票券 71）：新專案的兩份大綱
 * 一建立就在，舊專案的要第一次打開才建，兩者都還沒寫的時候卡片要長得一樣。寫了又全刪掉的也回到這裡。
 */
export function cardMeta(edited: { updatedAt: Date; words?: number } | undefined): string {
  if (!edited) return NOT_STARTED;
  const date = EDITED_DATE.format(edited.updatedAt);
  if (edited.words === undefined) return date;
  return edited.words === 0 ? NOT_STARTED : `${date} · ${writtenSoFar(edited.words)}`;
}

const NOT_STARTED = "尚未開始";

/** 一份文件寫了多少：「1,234 字」；一個字都還沒有就是「尚未開始」。hub 卡片與建立精靈的摘要共用（票券 71）。 */
export function writtenSoFar(words: number): string {
  return words === 0 ? NOT_STARTED : `${words.toLocaleString("en-US")} 字`;
}
