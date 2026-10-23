/**
 * 選起的整個節點（點 ⠿ 選起的區塊、點場次號選起的整場）：鍵盤與剪貼簿都對它作用（票券 13）。
 *
 * ProseMirror 自己就會複製、剪下 `NodeSelection`，但這裡有三個地方接不上（使用者驗收 2026-10-22）：
 * 1. **copy／cut 的 target 落在 node view 的非內容區**：瀏覽器把它派給選取起點所在的元素 —— 選起對白
 *    或整場時是人物 chip、場次的 chip row，那裡是可編輯的欄位，Tiptap 的 `stopEvent` 把事件留給欄位，
 *    PM 收不到。結果是瀏覽器原生複製畫面上的 DOM（貼回來變成幾行動作），剪下則是瀏覽器直接拆 React
 *    管的 DOM（`removeChild` 錯誤、⌘Z 回不來）。所以 copy／cut 在 document 的 capture 階段就接走。
 * 2. **選單開著時焦點在選單上**：選單用不到的鍵（⌫、Delete、打字、⌘C／⌘X）收起選單、交回編輯器。
 * 3. **點頁面空白處**：焦點掉到 body，反白還在卻按什麼都沒反應 —— 焦點拉回編輯器，選取照舊。
 * 4. **選單開著時點文件裡面**：那一下只收起選單，選取留著 —— 給編劇一次複製、剪下的機會；
 *    再點一下才照常放游標（使用者回饋 2026-10-22）。
 */
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { closePointMenu, pointMenus } from "../point-menu";

/** 選單自己用的鍵（`SceneMenu`）與單按的修飾鍵：照舊留在選單裡。 */
const MENU_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "Enter",
  "Escape",
  "Tab",
  "Shift",
  "Meta",
  "Control",
  "Alt",
]);

const held = (view: EditorView) => view.state.selection instanceof NodeSelection;

/** 點 ⠿／場次號開出來、還開著的那個選單。 */
function openHandleMenu(view: EditorView): HTMLElement | null {
  const anchor = pointMenus.get()?.anchor;
  return anchor instanceof HTMLElement && view.dom.contains(anchor) ? anchor : null;
}

/** 焦點不在別的輸入處：在編輯器上、在選單上，或掉到 body。 */
function focusIsOurs(view: EditorView): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active === view.dom || !!active.closest(".point-menu");
}

function clipboard(view: EditorView) {
  return (event: ClipboardEvent) => {
    if (!held(view) || !event.clipboardData || !focusIsOurs(view)) return;
    const { dom, text } = view.serializeForClipboard(view.state.selection.content());
    event.preventDefault();
    event.stopPropagation();
    event.clipboardData.clearData();
    event.clipboardData.setData("text/html", dom.innerHTML);
    event.clipboardData.setData("text/plain", text);
    closePointMenu();
    if (event.type === "cut") view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));
  };
}

function menuKeys(view: EditorView) {
  return (event: KeyboardEvent) => {
    if (MENU_KEYS.has(event.key) || !held(view) || !openHandleMenu(view)) return;
    if (!event.target || !(event.target as Element).closest?.(".point-menu")) return;
    closePointMenu(); // 它的 onClose 把焦點還給編輯器
    view.focus();
    // 打字與 ⌘C／⌘X：焦點換過去之後，接下來的 keypress／copy 自然落在編輯器。
    // ⌫ 這類 PM 在 keydown 就處理的鍵：這一下已經送到選單了，原樣補送一次給編輯器。
    if (event.key.length === 1 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    view.dom.dispatchEvent(new KeyboardEvent("keydown", event));
  };
}

/**
 * 選單開著時點進文件：`pointerdown` 先記下這一下（選單的「點外面就收起」也在這時收），接著的
 * `mousedown` 不交給 PM —— 它會把選取換成游標。document capture、比選單早註冊，先輪到這裡判斷。
 */
function firstClickCloses(view: EditorView) {
  let swallow = false;
  const onPointerDown = (event: Event) => {
    const target = event.target as Element | null;
    const anchor = openHandleMenu(view);
    swallow =
      !!anchor && held(view) && !!target && view.dom.contains(target) && !anchor.contains(target);
  };
  const onMouseDown = (event: Event) => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopPropagation();
    closePointMenu();
  };
  return { onPointerDown, onMouseDown };
}

function keepFocus(view: EditorView) {
  return () => {
    setTimeout(() => {
      if (held(view) && view.dom.isConnected && (!document.activeElement || document.activeElement === document.body)) {
        view.focus();
      }
    });
  };
}

export const HeldNode = Extension.create({
  name: "heldNode",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("heldNode"),
        view(view) {
          const onClipboard = clipboard(view) as EventListener;
          const onKey = menuKeys(view) as EventListener;
          const onFocusOut = keepFocus(view);
          const { onPointerDown, onMouseDown } = firstClickCloses(view);
          document.addEventListener("pointerdown", onPointerDown, true);
          document.addEventListener("mousedown", onMouseDown, true);
          document.addEventListener("copy", onClipboard, true);
          document.addEventListener("cut", onClipboard, true);
          document.addEventListener("keydown", onKey, true);
          view.dom.addEventListener("focusout", onFocusOut);
          return {
            destroy() {
              document.removeEventListener("pointerdown", onPointerDown, true);
              document.removeEventListener("mousedown", onMouseDown, true);
              document.removeEventListener("copy", onClipboard, true);
              document.removeEventListener("cut", onClipboard, true);
              document.removeEventListener("keydown", onKey, true);
              view.dom.removeEventListener("focusout", onFocusOut);
            },
          };
        },
      }),
    ];
  },
});
