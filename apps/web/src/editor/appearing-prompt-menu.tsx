/**
 * 登場人物提示的選單（票券 10）—— 排在那一句對白的台詞底下。
 *
 * 時機與收起的規則在 `extensions/appearing-prompt`；這裡只負責畫出來、把三個出口接上。
 *
 * **不搶焦點**：列用 `onMouseDown` ＋ `preventDefault`，按下去時游標仍留在編劇正在寫的那一段
 * （同其他選單的做法），打字照舊落在內文。
 *
 * **鍵盤**：選單開著時 ↑↓ 歸它（使用者裁決 2026-09-29）—— 第一次按才亮起一列，**沒有預選**；
 * Enter 只在有亮起的列時才算選擇，否則照常屬於內文。預選第一列的話，順手一個 Enter 就等於在
 * 不知情下被加進登場人物欄。代價是選單開著時 ↑↓ 不移游標，要先 Esc。
 */
"use client";

import type { DialogueCharacterRef } from "@scenephonie/schema";
import { useEffect, useRef, useState } from "react";

import { dismissOnOutsidePointer } from "./dismiss-on-outside-pointer";

interface Row {
  readonly speaker: DialogueCharacterRef;
  readonly choice: "add" | "dismiss";
}

export function AppearingPromptMenu({
  speakers,
  keyboardFrom,
  onAdd,
  onDismiss,
  onClose,
}: {
  speakers: readonly DialogueCharacterRef[];
  /** 編輯器內文的 contenteditable —— 焦點在它身上時，↑↓／Enter 才歸選單（人物欄等輸入框不算）。 */
  keyboardFrom: HTMLElement;
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

  const rows: Row[] = speakers.flatMap((speaker) => [
    { speaker, choice: "add" as const },
    { speaker, choice: "dismiss" as const },
  ]);
  const choose = (row: Row) => (row.choice === "add" ? onAdd : onDismiss)(row.speaker);

  /** 亮起的那一列；`null` ＝ 還沒碰過鍵盤（沒有預選）。 */
  const [active, setActive] = useState<number | null>(null);
  const keys = useRef({ rows, active, choose });
  keys.current = { rows, active, choose };

  useEffect(() => {
    // window 的 capture 階段收：要搶在 ProseMirror 自己的 keydown（移游標、斷行）之前。
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target !== keyboardFrom || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const { rows, active, choose } = keys.current;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(
          active === null
            ? step === 1 ? 0 : rows.length - 1
            : (active + step + rows.length) % rows.length,
        );
      } else if (event.key === "Enter" && active !== null && rows[active]) {
        choose(rows[active]);
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keyboardFrom]);

  return (
    <div ref={root} className="appearing-prompt" contentEditable={false}>
      {speakers.map((speaker, s) => (
        <div key={speaker.id} role="group" aria-label={`${speaker.displayName}要不要列為登場人物`}>
          <p className="entity-field__note">
            「{speaker.displayName}」有台詞，但不在這一場的登場人物欄
          </p>
          <ul className="entity-field__menu entity-field__menu--nested" role="menu">
            {(["add", "dismiss"] as const).map((choice, c) => (
              <li
                key={choice}
                role="menuitem"
                className={active === s * 2 + c ? "is-active" : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose({ speaker, choice });
                }}
              >
                {choice === "add" ? "＋ 新增為登場人物" : "✕ 不新增 —— 他不入鏡"}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
