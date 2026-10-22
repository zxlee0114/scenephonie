/**
 * 拖曳把手（票券 13）—— 只是記號：拖起來的是什麼、能放到哪裡、點下去開什麼選單，由
 * `../extensions/drag-reorder` 從它所在的節點反推。必須 `contenteditable=false`，否則會被當成內容。
 *
 * 區塊與群組用 ⠿；**場次（主場次、子場次）的把手就是場次號**（`./scene`，使用者驗收 2026-10-22：
 * ⠿ 擠在場次號旁邊跟版面打架，而且點場次號本來就開選單）。認把手一律認 `data-drag-handle`。
 * 靜態 node view 用 `dragHandle()`，React node view 用 `<DragHandle />` —— 長相只定義在這裡。
 */
export const HANDLE_SELECTOR = "[data-drag-handle]";

const GLYPH = "⠿";
const classOf = (group: boolean) => (group ? "drag-handle drag-handle--group" : "drag-handle");

export function dragHandle({ group = false } = {}): HTMLElement {
  const handle = document.createElement("span");
  handle.className = classOf(group);
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.dataset.dragHandle = "";
  handle.setAttribute("aria-hidden", "true");
  handle.textContent = GLYPH;
  return handle;
}

export function DragHandle() {
  return (
    <span className={classOf(false)} contentEditable={false} draggable data-drag-handle="" aria-hidden="true">
      {GLYPH}
    </span>
  );
}
