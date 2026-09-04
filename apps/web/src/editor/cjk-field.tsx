/**
 * 中文輸入安全的受控欄位 —— §7.6 / 原型 `src/cjk-input.tsx`。
 *
 * bug 家族：`<input value={外部狀態} onChange={立刻回寫外部}>`。注音組字期間瀏覽器仍會觸發
 * input 事件，「ㄅ」被寫進文件、再從文件流回 `value`，把 input 值重設 → **清掉 IME 的組字
 * 緩衝**，注音符號一個個掉出來而不是組成字。
 *
 * 修法（標準做法）：**組字期間只更新本地狀態，`compositionend` 才回寫**。這與 ProseMirror
 * 無關 —— 任何「受控輸入 ＋ 立即回寫外部儲存」都會中招。
 */
"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from "react";

type Props = Omit<ComponentPropsWithRef<"input">, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

export const CjkField = forwardRef<HTMLInputElement, Props>(function CjkField(
  { value, onCommit, ...rest },
  ref,
) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);

  // 外部值變動時同步 —— 但組字進行中絕不覆寫。
  useEffect(() => {
    if (!composing.current) setLocal(value);
  }, [value]);

  return (
    <input
      {...rest}
      ref={ref}
      value={local}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        const next = event.currentTarget.value;
        setLocal(next);
        onCommit(next);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setLocal(next);
        if (!composing.current) onCommit(next); // 組字中不回寫
      }}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
        rest.onBlur?.(event);
      }}
    />
  );
});
