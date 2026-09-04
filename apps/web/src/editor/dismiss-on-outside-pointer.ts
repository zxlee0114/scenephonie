/**
 * 「點外面就收起來」的那條線（票券 29）。
 *
 * 彈出層自己不知道使用者放棄了它 —— slash 選單原本只在 Tiptap suggestion exit 時關閉，
 * 而那要編輯器收到 transaction 才會發生：點編輯器內部剛好可以，點 header 或頁面留白就不行，
 * 選單於是留在畫面上。
 *
 * 用 `pointerdown` 不用 `click`：滑鼠、觸控、筆都涵蓋，而且在 `mousedown` 之前就決定好，
 * 不會和選單項目自己的 `onMouseDown` 搶。capture 階段收，免得中途有人 `stopPropagation`。
 */
export function dismissOnOutsidePointer(el: HTMLElement, close: () => void): () => void {
  const onPointerDown = (event: Event) => {
    const target = event.target;
    // 點在選單自己身上的那一下是「要選它」，關掉會讓接下來的 click 落空。
    if (target instanceof Node && el.contains(target)) return;
    close();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  return () => document.removeEventListener("pointerdown", onPointerDown, true);
}
