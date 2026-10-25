import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 儀表板上的一張專案卡（票券 71）：專案名稱；劇本名稱**跟專案名稱不同時才印**（相同就不重複）；
 * 名字下面那一行淡字。版面沿用 hub 的卡片（`.hub-card`），寬螢幕是卡片網格、手機是清單。
 *
 * 沒有 `href` 的是已刪除的專案（票券 72）：它打不開，只剩名字、倒數與「還原」。
 * 卡上的動作疊在撐滿的連結之上，不包在連結裡 —— 按鈕不能放進 `<a>`（同 `DocumentCard`）。
 *
 * 這張卡片的樣子是暫定的 —— 看實際呈現再調（票券 71 第 3 條）。
 */
export function ProjectCard({
  href,
  title,
  screenplayTitle,
  meta,
  action,
}: {
  href?: string;
  title: string;
  screenplayTitle: string;
  /** 「最後編輯 …」或已刪除的「還剩 N 天」。 */
  meta: string;
  action?: ReactNode;
}) {
  return (
    <li className={href ? "hub-card project-card" : "hub-card hub-card--pending project-card"}>
      {href ? (
        <Link href={href} className="hub-card__name">
          {title}
        </Link>
      ) : (
        <span className="hub-card__name">{title}</span>
      )}
      {screenplayTitle !== title && <span className="project-card__screenplay">{screenplayTitle}</span>}
      <span className="hub-card__meta">{meta}</span>
      {action}
    </li>
  );
}
