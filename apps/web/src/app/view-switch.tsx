/**
 * 「劇本／場次表」的路由那一半（票券 15，§7.10）：**子路由 ＋ 頁內 segmented control**。編輯器頁與
 * 分享頁（票券 20）共用 —— 網址是視圖的定位，不是另一份文件、也不是另一條分享（`./` 是劇本、
 * `./table` 是場次表）。
 */
"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

const TABLE_SEGMENT = "table";

export type View = "script" | "table";

/** 現在是哪個視圖 —— 讀 layout 底下那一段網址。 */
export function useView(): View {
  return useSelectedLayoutSegment() === TABLE_SEGMENT ? "table" : "script";
}

/** 頁內的 segmented control：「劇本／場次表」。 */
export function ViewSwitch({ base }: { base: string }) {
  const view = useView();
  return (
    <nav className="view-switch" aria-label="檢視">
      <Link href={base} className="view-switch__item" aria-current={view === "script" ? "page" : undefined}>
        劇本
      </Link>
      <Link
        href={`${base}/${TABLE_SEGMENT}`}
        className="view-switch__item"
        aria-current={view === "table" ? "page" : undefined}
      >
        場次表
      </Link>
    </nav>
  );
}
