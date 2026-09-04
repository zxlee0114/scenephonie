/**
 * 打字餘裕（typewriter scrolling）—— 票券 27。
 *
 * 新增下一場時，瀏覽器原生的 `scrollIntoView` 只保證「看得到」：新場次剛好出現在可視範圍的最
 * 下緣，手要打的那一行貼著螢幕底邊，下方沒有任何餘裕。編劇是一路往下寫的，這個位置在整段
 * 寫作過程中都難受（判準與 §7.10「八小時的疲勞度」同一條）。文書處理器與寫作工具的慣例是把
 * 作用中的那一行維持在畫面中段：往下寫時是文件在動，不是眼睛在追。
 *
 * **範圍**：只在「新增下一場」時置中（見 `nodes/scene.tsx` 的 scene-birth 串接）。每一次打字都
 * 維持 typewriter scrolling 是另一件事 —— 會與瀏覽器原生的捲動行為打架，留給 design pass。
 *
 * 落點偏上而非視窗正中：下方是要留給即將寫出來的內容的。文件尾端的最後一場捲不到這條線時
 * （`maxScrollTop` 夾住），落點由 `.screenplay-page` 的頁尾留白（`editor.css` 的 `40vh`）決定 ——
 * 那已足以讓它離開底緣、停在畫面中段，所以這裡不去硬撐、也不為了置中而加大留白（留白只在捲到
 * 底時看得到，加大就是拿「大片空白」換幾個百分點）。
 */

/** 作用中那一場的上緣要停在視窗高度的幾成處。偏上 —— 寫作工具的慣例。 */
export const TYPEWRITER_ANCHOR = 0.4;

export interface WritingScrollInput {
  /** 目標元素上緣相對視窗的位置（`getBoundingClientRect().top`）。 */
  readonly elementTop: number;
  /** 目前的捲動位置。 */
  readonly scrollY: number;
  readonly viewportHeight: number;
  /** 這份文件最多能捲到哪（可能為負 —— 內容不足一畫面）。 */
  readonly maxScrollTop: number;
}

/** 要把捲軸帶到哪，才能讓目標元素停在打字餘裕線上。夾在 `[0, maxScrollTop]`。 */
export function writingScrollTop({
  elementTop,
  scrollY,
  viewportHeight,
  maxScrollTop,
}: WritingScrollInput): number {
  const wanted = scrollY + elementTop - viewportHeight * TYPEWRITER_ANCHOR;
  return Math.max(0, Math.min(wanted, maxScrollTop));
}

/**
 * 把目標元素捲到打字餘裕線上。捲的是**頁面**（編輯器沒有自己的捲動容器 —— `.editor-shell`
 * 不設 overflow，見 `styles/editor.css`）。
 *
 * 「動起來」照 `prefers-reduced-motion` 決定；`matchMedia` 在測試環境可能不存在，故是選擇性呼叫。
 */
export function scrollToWritingPosition(element: Element | null | undefined): void {
  if (!element || typeof window === "undefined") return;

  const top = writingScrollTop({
    elementTop: element.getBoundingClientRect().top,
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    maxScrollTop: document.documentElement.scrollHeight - window.innerHeight,
  });

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
}
