/** 元素所在的捲動區（最近一個會捲的祖先；都不會捲就是整頁）。 */
export function scrollParentOf(el: Element): HTMLElement {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if ((overflowY === "auto" || overflowY === "scroll") && at.scrollHeight > at.clientHeight) return at;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** 捲動區在視窗裡看得到的範圍（整頁就是視窗本身）。 */
export function visibleBoundsOf(scroller: HTMLElement) {
  const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  if (scroller === document.scrollingElement) return viewport;
  const r = scroller.getBoundingClientRect();
  return {
    left: Math.max(r.left, 0),
    top: Math.max(r.top, 0),
    right: Math.min(r.right, viewport.right),
    bottom: Math.min(r.bottom, viewport.bottom),
  };
}
