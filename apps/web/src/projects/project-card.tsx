import Link from "next/link";

import { cardMeta } from "@/documents/document-card";

import type { ProjectSummary } from "./project-store";

/**
 * 儀表板上的一張專案卡（票券 71）：專案名稱；劇本名稱**跟專案名稱不同時才印**（相同就不重複）；
 * 最後編輯。版面沿用 hub 的卡片（`.hub-card`），寬螢幕是卡片網格、手機是清單。
 *
 * 這張卡片的樣子是暫定的 —— 看實際呈現再調（票券 71 第 3 條）。
 */
export function ProjectCard({ projectId, title, screenplayTitle, lastEditedAt }: ProjectSummary) {
  return (
    <li className="hub-card project-card">
      <Link href={`/projects/${projectId}`} className="hub-card__name">
        {title}
      </Link>
      {screenplayTitle !== title && <span className="project-card__screenplay">{screenplayTitle}</span>}
      <span className="hub-card__meta">最後編輯 {cardMeta({ updatedAt: lastEditedAt })}</span>
    </li>
  );
}
