"use client";

import { useEffect, useState } from "react";

import type { Autosave, SaveStatus } from "./use-autosave";

/**
 * 每個狀態說什麼、要不要出聲 —— **一張表**。
 *
 * 自動存檔是承諾不是功能，所以它平時沉默；`loud` 是「這件事使用者非知道不可」。
 * 兩件事併在一起，是因為分成「文字表 ＋ 另一處的白名單」時，加一個狀態要記得改兩個地方，
 * 而其中一處漏改不會有人發現。`noun` 是存的那一份叫什麼（劇本、交件大綱…，票券 21）。
 */
const statusText = (noun: string): Record<SaveStatus, { text: string; loud: boolean }> => ({
  idle: { text: "", loud: false },
  saving: { text: "儲存中…", loud: false },
  saved: { text: "已儲存", loud: false },
  error: { text: "存檔失敗，會再試一次", loud: true },
  conflict: { text: `這份${noun}在別的地方被改過了，請重新整理再繼續`, loud: true },
  forbidden: { text: `沒有權限存這份${noun}，請重新登入`, loud: true },
});

/**
 * 存檔狀態，以及「現在就存」的兩個入口（票券 65）。
 *
 * 存不進去時，說「會再試」就要說得出什麼時候：畫面倒數「x 秒後重試」，旁邊一顆「立刻重試」。
 * 倒數每秒都在變，所以它**不進** live region —— 那裡只放不變的那句，螢幕閱讀器說一次就夠，
 * 不會每秒唸一遍。
 *
 * ⌘S 任何時候都是「現在就存」：編劇的手指本來就會按它，而瀏覽器預設的「另存網頁」在這裡
 * 沒有意義。沒有待存的變更時它什麼都不做，跟自動存檔一樣沉默。
 */
export function SaveStatusLine({ status, flush, nextRetryAt, noun = "劇本" }: Autosave & { noun?: string }) {
  const texts = statusText(noun);
  const failed = status === "error";
  const retryIn = useRetryCountdown(failed, nextRetryAt);
  const counting = failed && retryIn !== undefined && retryIn > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void flush();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flush]);

  return (
    <div className={`save-status${texts[status].loud ? " save-status--loud" : ""}`}>
      <p className={counting ? "sr-only" : "save-status__text"} role="status" aria-live="polite">
        {texts[status].text}
      </p>
      {counting && (
        <span aria-hidden="true">
          存檔失敗，<span className="save-status__seconds">{retryIn}</span> 秒後重試
        </span>
      )}
      {failed && (
        <button
          type="button"
          className="save-status__retry"
          aria-keyshortcuts="Meta+S"
          // 焦點留在稿子上 —— 按完要能接著寫（同快捷鍵鈕）。
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void flush()}
        >
          立刻重試
        </button>
      )}
    </div>
  );
}

/** 離下一次重試還有幾秒（無條件進位）；沒在等重試就是 `undefined`。 */
function useRetryCountdown(active: boolean, nextRetryAt: () => number | undefined): number | undefined {
  const [seconds, setSeconds] = useState<number | undefined>();

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const at = nextRetryAt();
      setSeconds(at === undefined ? undefined : Math.ceil((at - Date.now()) / 1000));
    };
    // 先跑一次再每秒跑：狀態轉成 error 的那一刻就要有數字，不要先閃一秒「會再試一次」。
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      setSeconds(undefined);
    };
  }, [active, nextRetryAt]);

  return seconds;
}
