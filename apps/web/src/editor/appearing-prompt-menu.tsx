/**
 * 登場人物提示的選單（票券 10）—— 浮在那一句對白的人物欄底下。
 *
 * 時機與收起的規則在 `extensions/appearing-prompt`；這裡只負責畫出來、把三個出口接上。
 *
 * **不搶焦點**：列用 `onMouseDown` ＋ `preventDefault`，按下去時游標仍留在編劇正在寫的那一段
 * （同其他選單的做法）。沒有鍵盤選列 —— 游標在內文裡，Enter 與方向鍵屬於內文；鍵盤能做的是
 * Esc（「現在別煩我」）。
 */
"use client";

import type { DialogueCharacterRef } from "@scenephonie/schema";
import { useEffect, useRef } from "react";

import { dismissOnOutsidePointer } from "./dismiss-on-outside-pointer";

export function AppearingPromptMenu({
  speakers,
  onAdd,
  onDismiss,
  onClose,
}: {
  speakers: readonly DialogueCharacterRef[];
  /** `＋ 新增為登場人物` —— 寫進本場的登場人物欄。 */
  onAdd: (speaker: DialogueCharacterRef) => void;
  /** `✕ 不新增 —— 他不入鏡` —— 明確判斷，記進本場的 `dismissedCharacterIds`。 */
  onDismiss: (speaker: DialogueCharacterRef) => void;
  /** 點到別處 ＝ 現在別煩我，不記錄任何判斷。 */
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // 讀最新的那一支：選單開著時 DialogueView 會重繪，effect 不必跟著重綁。
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => dismissOnOutsidePointer(() => root.current, () => close.current()), []);

  return (
    <div ref={root} className="appearing-prompt" contentEditable={false}>
      {speakers.map((speaker) => (
        <div key={speaker.id} role="group" aria-label={`${speaker.displayName}要不要列為登場人物`}>
          <p className="entity-field__note">
            「{speaker.displayName}」有台詞，但不在這一場的登場人物欄
          </p>
          <ul className="entity-field__menu entity-field__menu--nested" role="menu">
            <li
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(speaker);
              }}
            >
              ＋ 新增為登場人物
            </li>
            <li
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault();
                onDismiss(speaker);
              }}
            >
              ✕ 不新增 —— 他不入鏡
            </li>
          </ul>
        </div>
      ))}
    </div>
  );
}
