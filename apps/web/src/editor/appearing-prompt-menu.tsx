/**
 * 登場人物提示的選單（票券 10）—— 浮在那一句對白的台詞底下。
 *
 * 時機與「問完接著走」在 `extensions/appearing-prompt`；這裡只負責畫出來、把出口接上。
 *
 * **焦點在選單上**（使用者裁決 2026-09-29，驗收回饋）：Enter 被攔下來、下一段還沒開，這一刻
 * 選單就是編劇眼前唯一要回答的事。↑↓ 走列、Enter 選、Esc 跳過。**仍然沒有預選**：打開它的
 * 正是一顆 Enter，連按兩下（或按住）不該等於在不知情下做了決定 —— 第一次 ↑↓ 才亮起一列。
 *
 * **不佔版面**：絕對定位浮在台詞底下（同日回饋）。下一段要等選完才開，那一格沒有人在寫字。
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
  onAdd,
  onDismiss,
  onSkip,
  onClose,
}: {
  speakers: readonly DialogueCharacterRef[];
  /** `＋ 新增為登場人物` —— 寫進本場的登場人物欄。 */
  onAdd: (speaker: DialogueCharacterRef) => void;
  /** `✕ 不新增 —— 他不入鏡` —— 明確判斷，記進本場的 `dismissedCharacterIds`。 */
  onDismiss: (speaker: DialogueCharacterRef) => void;
  /** Esc ＝ 現在別煩我：不記錄任何判斷，照樣開下一段。 */
  onSkip: () => void;
  /** 點到別處 ＝ 他要去別的地方了：不記錄、也不開下一段。 */
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  const rows: Row[] = speakers.flatMap((speaker) => [
    { speaker, choice: "add" as const },
    { speaker, choice: "dismiss" as const },
  ]);
  /** 已經回答了（選了、Esc、點走）—— 之後焦點回內文是**對的**，不再收回來。 */
  const answered = useRef(false);
  const choose = (row: Row) => {
    answered.current = true;
    (row.choice === "add" ? onAdd : onDismiss)(row.speaker);
  };

  /** 亮起的那一列；`null` ＝ 還沒碰過鍵盤（沒有預選）。 */
  const [active, setActive] = useState<number | null>(null);
  // 讀最新的那一份：選單開著時 DialogueView 會重繪，監聽不必跟著重綁。
  const latest = useRef({ rows, active, choose, onSkip, onClose });
  latest.current = { rows, active, choose, onSkip, onClose };

  useEffect(
    () =>
      dismissOnOutsidePointer(
        () => root.current,
        () => {
          answered.current = true;
          latest.current.onClose();
        },
      ),
    [],
  );

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // ProseMirror 本來就不收 node view 裡非內文元素上的鍵（Tiptap 的 `stopEvent`），Backspace
    // 碰不到台詞；這裡再擋住往上冒，免得 window 上的全域快捷鍵把它當成內文的鍵。選單開著時
    // 每一顆鍵都是它的。
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.isComposing) return;
      const { rows, active, choose, onSkip } = latest.current;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(
          active === null
            ? step === 1 ? 0 : rows.length - 1
            : (active + step + rows.length) % rows.length,
        );
      } else if (event.key === "Enter") {
        if (active !== null && rows[active]) choose(rows[active]);
      } else if (event.key === "Escape") {
        answered.current = true;
        onSkip();
      } else if (event.key !== "Tab") {
        return;
      }
      // Tab 也吞掉：焦點不該從一個還沒回答的問題上溜走。
      event.preventDefault();
    };
    el.addEventListener("keydown", onKeyDown);

    // 選單開著時焦點被拉回內文（延後執行的 focus、別處程式呼叫的 `view.focus()`），那些鍵就落到
    // 內文去了：↑ 移游標、Enter 被攔著什麼都不做 —— 看起來像卡住。收回來。編劇自己點走不會走到
    // 這裡：點到別處時選單已經先收起了（`dismissOnOutsidePointer`）。回答之後 `resume…` 把焦點
    // 還給內文那一下選單還掛著，同樣不收（`answered`）。
    const content = el.closest<HTMLElement>(".ProseMirror");
    const onFocusIn = (event: FocusEvent) => {
      if (!answered.current && event.target === content) el.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <div
      ref={root}
      className="appearing-prompt"
      contentEditable={false}
      tabIndex={-1}
      role="dialog"
      aria-label="登場人物提示"
    >
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
                // 滑鼠與鍵盤共用同一個「現在停在哪」：各亮各的，就會兩列同時亮著（同其他選單）。
                onMouseEnter={() => setActive(s * 2 + c)}
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
