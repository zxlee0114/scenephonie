/**
 * 編輯器頁的路由接線：把網址段翻成 `view`，把「請切回劇本」翻成一次導覽，交給編輯器（編輯器不認識
 * 路由層）。「劇本／場次表」那一組在 `@/app/view-switch`，分享頁也用同一組。
 */
"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

import { useView } from "@/app/view-switch";
import { ScreenplayEditor } from "@/editor/ScreenplayEditor";

import type {
  createDeliveryAction,
  revokeShareLinksAction,
  setShareLinkNoteAction,
  shareDeliveryAction,
  shareLinksAction,
  shareLiveAction,
  shareSnapshotAction,
} from "./actions";

/** 分享（票券 20）的六支 action。型別跟著 action 走。 */
export interface SharingActions {
  shareDelivery: typeof shareDeliveryAction;
  shareLive: typeof shareLiveAction;
  shareSnapshot: typeof shareSnapshotAction;
  shareLinks: typeof shareLinksAction;
  revoke: typeof revokeShareLinksAction;
  setNote: typeof setShareLinkNoteAction;
}

/** 分享連結的完整網址 —— 分享出去的是網址，不是 token。 */
const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

export function ScreenplayWorkspace(
  props: Omit<
    ComponentProps<typeof ScreenplayEditor>,
    "view" | "onShowScript" | "exportPdf" | "share"
  > & {
    base: string;
    /** 匯出意圖。型別跟著 action 走，不另抄一份。 */
    createDelivery: typeof createDeliveryAction;
    sharing: SharingActions;
  },
) {
  const { base, createDelivery, sharing, ...editorProps } = props;
  const router = useRouter();
  const { screenplayId } = editorProps;
  return (
    <ScreenplayEditor
      {...editorProps}
      view={useView()}
      onShowScript={() => router.push(base)}
      share={
        screenplayId
          ? {
              list: () => sharing.shareLinks({ screenplayId }),
              shareLive: () => sharing.shareLive({ screenplayId }),
              shareSnapshot: () => sharing.shareSnapshot({ screenplayId }),
              revoke: (shareIds) => sharing.revoke({ screenplayId, shareIds }),
              setNote: (shareId, note) =>
                sharing.setNote({ screenplayId, shareId, note }),
              urlOf: shareUrl,
            }
          : undefined
      }
      exportPdf={
        screenplayId
          ? {
              createDelivery: async () => {
                const result = await createDelivery({ screenplayId });
                return result.status === "delivered" ? result.deliveryId : null;
              },
              // 交付的 PDF 住在劇本底下（`./deliveries/[deliveryId]/pdf`）—— 讀的是那一筆交付。
              pdfUrl: (deliveryId, query) =>
                `${base}/deliveries/${deliveryId}/pdf?${query}`,
              // 凍結分享：按了「取得這次交付的連結」才鑄（票券 20）。
              shareDelivery: async (deliveryId) => {
                const token = await sharing.shareDelivery({
                  screenplayId,
                  deliveryId,
                });
                return token ? shareUrl(token) : null;
              },
            }
          : undefined
      }
    />
  );
}
