/**
 * 拖曳把手（票券 13）—— 只是記號：拖起來的是什麼、能放到哪裡，由 `../extensions/drag-reorder`
 * 從它所在的節點反推。必須 `contenteditable=false`，否則會被當成內容。
 *
 * 區塊的把手在內文左邊；場次（主場次、子場次）與群組的把手（`scene`）放在 gutter 左邊。
 * 靜態 node view 用 `dragHandle()`，React node view 用 `<DragHandle />` —— 長相只定義在這裡。
 */
const GLYPH = "⠿";
const classOf = (scene: boolean) => (scene ? "drag-handle drag-handle--scene" : "drag-handle");

export function dragHandle({ scene = false } = {}): HTMLElement {
  const handle = document.createElement("span");
  handle.className = classOf(scene);
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.setAttribute("aria-hidden", "true");
  handle.textContent = GLYPH;
  return handle;
}

export function DragHandle({ scene = false }: { scene?: boolean }) {
  return (
    <span className={classOf(scene)} contentEditable={false} draggable aria-hidden="true">
      {GLYPH}
    </span>
  );
}
