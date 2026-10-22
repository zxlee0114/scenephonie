/**
 * 定點選單（票券 13）—— 浮在某個座標上、由 plugin 打開的 `SceneMenu`。兩種用法：
 * - **點把手**（區塊、群組）：選起那個節點，列出能對它做的事；
 * - **降級時問種類**：主場次拖進別場 ＝ 變成子場次，而 `種類` 必填、系統不代填（ADR-0006）。用詞與
 *   `/` 選單、區塊逃生口相同（「改成插入戲 ／ 改成接續」，CONTEXT.md），不預設任何一種。
 *
 * 按 Esc 或點外面 ＝ 取消。時機在 `./extensions/drag-reorder`；這裡只負責畫出來。跟 `SlashMenu`
 * 一樣掛在編輯器旁邊。
 */
"use client";

import { requestStore } from "./request-store";
import { SceneMenu, type MenuRow } from "./scene-menu";

export interface PointMenuRequest {
  readonly x: number;
  readonly y: number;
  readonly rows: readonly MenuRow[];
  /** 選單收起（選了一列、Esc、點外面）時 —— 通常是把焦點還給編輯器。 */
  readonly onClose?: () => void;
}

export const pointMenus = requestStore<PointMenuRequest>();

export function PointMenu() {
  const request = pointMenus.use();
  if (!request) return null;
  return (
    <div className="point-menu" style={{ top: request.y, left: request.x }}>
      <SceneMenu
        onClose={() => {
          pointMenus.set(null);
          request.onClose?.();
        }}
        rows={request.rows}
      />
    </div>
  );
}
