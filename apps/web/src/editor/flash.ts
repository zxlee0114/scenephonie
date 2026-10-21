/**
 * 「到了這裡」的暫時高亮：浮現底色再淡出，與「新增下一場」同一段（`editor.css` 的
 * `[data-just-revealed]`）。劇本那側標跳回的落點、場次表那側標對位的那一列（票券 15）。
 *
 * 掛 data 屬性而不是 class —— className 歸 React 管（node view、表格列），重繪會洗掉手加的 class。
 * 卸屬性走 animationend（理由同 `nodes/scene.tsx`：不用 setTimeout）；子孫的動畫事件會冒泡上來，
 * 所以只認自己或自己的直接孩子（表格列的底色畫在 `<td>` 上）。
 */
export function flash(el: Element): void {
  el.removeAttribute("data-just-revealed");
  void (el as HTMLElement).offsetWidth; // 同一個元素連續兩次也要重播
  el.setAttribute("data-just-revealed", "");
  const done = (event: Event) => {
    if (event.target !== el && (event.target as Node).parentNode !== el) return;
    el.removeAttribute("data-just-revealed");
    el.removeEventListener("animationend", done);
  };
  el.addEventListener("animationend", done);
}
