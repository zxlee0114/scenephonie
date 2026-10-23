/** 分享頁的路由接線：把網址段翻成視圖、把「請切回劇本」翻成一次導覽。 */
"use client";

import { useRouter } from "next/navigation";

import type { DeliveryPayload } from "@scenephonie/schema";

import { useView } from "@/app/view-switch";
import { SharedScreenplay } from "@/share/SharedScreenplay";

export function SharedWorkspace({ payload, base }: { payload: DeliveryPayload; base: string }) {
  const router = useRouter();
  return <SharedScreenplay payload={payload} view={useView()} onShowScript={() => router.push(base)} />;
}
