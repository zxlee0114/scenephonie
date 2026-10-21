/**
 * 「劇本／場次表」的路由那一半（票券 15，§7.10）：**子路由 ＋ 頁內 segmented control**。
 * split view 已否決（場次表沒有寫入路徑，並排看不能編輯）。
 *
 * 網址是視圖的定位：`./` 是劇本、`./table` 是場次表。編輯器不認識路由層 —— 這裡把網址段翻成
 * `view`，把「請切回劇本」翻成一次導覽，交給它。
 */
"use client";

import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import type { ComponentProps } from "react";

import { ScreenplayEditor, type ScreenplayView } from "@/editor/ScreenplayEditor";

const TABLE_SEGMENT = "table";

function useView(): ScreenplayView {
  return useSelectedLayoutSegment() === TABLE_SEGMENT ? "table" : "script";
}

export function ScreenplayWorkspace(
  props: Omit<ComponentProps<typeof ScreenplayEditor>, "view" | "onShowScript"> & { base: string },
) {
  const { base, ...editorProps } = props;
  const router = useRouter();
  return <ScreenplayEditor {...editorProps} view={useView()} onShowScript={() => router.push(base)} />;
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
