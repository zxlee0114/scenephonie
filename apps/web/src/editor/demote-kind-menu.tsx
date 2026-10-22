/**
 * 降級時的種類選單（票券 13）—— 主場次拖進別場 ＝ 變成子場次，而 `種類` 必填、系統不代填
 * （ADR-0006）。所以放下那一刻先問：用詞與 `/` 選單、區塊逃生口相同（「改成插入戲 ／ 改成接續」，
 * CONTEXT.md），不預設任何一種。按 Esc 或點外面 ＝ 取消，什麼都不搬。
 *
 * 時機在 `./extensions/drag-reorder`；這裡只負責畫出來。跟 `SlashMenu` 一樣掛在編輯器旁邊。
 */
"use client";

import type { SubsceneKind } from "@scenephonie/schema";

import { requestStore } from "./request-store";
import { SceneMenu } from "./scene-menu";

export interface KindRequest {
  readonly x: number;
  readonly y: number;
  readonly choose: (kind: SubsceneKind) => void;
}

export const kindRequests = requestStore<KindRequest>();

export function DemoteKindMenu() {
  const request = kindRequests.use();
  if (!request) return null;
  return (
    <div className="drop-kind-menu" style={{ top: request.y, left: request.x }}>
      <SceneMenu
        onClose={() => kindRequests.set(null)}
        rows={[
          { key: "insert", label: "改成插入戲", run: () => request.choose("插入") },
          { key: "continue", label: "改成接續", run: () => request.choose("接續") },
        ]}
      />
    </div>
  );
}
