/**
 * sidebar 開著還是收著（票券 16，§7.10）：**可收合、預設展開、狀態持久化** —— 130 場時是剛需、
 * 8 場時是噪音，所以由編劇決定，而且重新整理之後還記得。
 *
 * **窄螢幕另論**（使用者裁決 2026-10-22）：放不下並排的一欄，展開就蓋掉整份稿子。那裡 sidebar 是
 * 一個叫出來才出現的抽屜，每次載入都是收著的、跳過去就收回去 —— 它的開合是一次性的動作，
 * 不是偏好，所以不寫進持久化（也不改寫寬螢幕記下的那一份）。
 *
 * 偏好只存在這台瀏覽器（localStorage）：它是一個人的閱讀習慣，不是劇本的狀態，不該跟著劇本走。
 * 讀寫都可能丟例外（隱私模式、封鎖站台資料）—— 那時退回預設展開，sidebar 照樣能用。
 */
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "scenephonie:scene-nav:collapsed";
/** 放得下 sidebar 與一整條閱讀行長並排的寬度。與 `editor.css` 的 `.scene-nav` 斷點同一個值。 */
const WIDE_QUERY = "(min-width: 64rem)";

function isWide(): boolean {
  // 沒有 matchMedia（jsdom）就當寬螢幕 —— 那是 sidebar 的本來面目。
  return typeof window.matchMedia !== "function" || window.matchMedia(WIDE_QUERY).matches;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 存不下就只在這一輪記得 —— 不值得打擾編劇。
  }
}

/**
 * ⚠️ 只在 client 呼叫（初值讀 `window`／localStorage）。sidebar 跟著編輯器一起出現，而編輯器本來就
 * 只在 client 建（`immediatelyRender: false`），伺服器端不會 render 到這裡。
 */
export function useSceneNavOpen(): { open: boolean; wide: boolean; setOpen: (open: boolean) => void } {
  const [wide, setWide] = useState(isWide);
  const [preferred, setPreferred] = useState(() => !readCollapsed());
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => {
      setWide(query.matches);
      setDrawer(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return {
    open: wide ? preferred : drawer,
    wide,
    setOpen: (next) => {
      if (!wide) {
        setDrawer(next);
        return;
      }
      setPreferred(next);
      writeCollapsed(!next);
    },
  };
}
