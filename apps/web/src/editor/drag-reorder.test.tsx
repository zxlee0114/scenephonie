// @vitest-environment jsdom
/**
 * 拖曳排序的手勢接線（票券 13、§7.5）—— 用真的編輯器組裝跑，派發原生拖放事件。
 *
 * 規則（什麼落點合法、搬完長什麼樣）在 kernel（`packages/schema/src/commands/move-*.test.ts`）與
 * 落點解析（`drop-intent.test.ts`）；這裡測的是**跟 ProseMirror 原生拖放搶事件**那一層（§7.5
 * 成本 3、§7.7「拖曳吃字、跑版、偶爾拖不動」）：
 * - 拖曳期間的 `dragover`／`drop` 一律 `preventDefault()` —— 瀏覽器的預設放置不准發生；
 * - 不合法的落點不畫線（`dropEffect = "none"`），放下去什麼都不變；
 * - 落點**從 drop 事件重算**，不讀指示線的狀態（中途的 `dragleave` 清不掉它）。
 *
 * jsdom 沒有版面：每個元素的矩形都是 0，所以 `clientY < 0` 是上半、`clientY > 0` 是下半。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { act, cleanup, createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import { mintCharacterId, mintGroupId, mintSceneId, schema as k } from "@scenephonie/schema";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { PointMenu } from "./point-menu";
import { edgeScrollStep } from "./extensions/drag-reorder";
import { useScreenplayEditor } from "./use-screenplay-editor";

const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const scene = (blocks: PMNode[]) => k.node("scene", { sceneId: mintSceneId() }, blocks);
const sub = (blocks: PMNode[]) => k.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, blocks);

function Harness({ content, onEditor }: { content: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(content, "documentEnd");
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
      <PointMenu />
    </EntityCatalogProvider>
  );
}

/** 預設：A：客廳 ＋ 子場次（回憶）＋ 回來；B：街上；C：夜。 */
async function mount(
  content = k.node("doc", null, [
    scene([action("客廳"), sub([action("回憶")]), action("回來")]),
    scene([action("街上")]),
    scene([action("夜")]),
  ]).toJSON() as object,
) {
  let editor: Editor | null = null;
  const view = render(<Harness content={content} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).not.toBeNull());
  await waitFor(() => expect(editor!.isInitialized).toBe(true));
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return { editor: editor!, container: view.container };
}

afterEach(cleanup);

const dataTransfer = () => ({
  dropEffect: "none",
  effectAllowed: "all",
  types: [] as string[],
  setData() {},
  getData: () => "",
  setDragImage() {},
});

/** 內文是 `text` 的那個區塊。 */
const blockOf = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLElement>(".block")].find((b) => b.textContent?.includes(text))!;

/** 第 `n` 個頂層場次（`.scene` 但不是子場次）。 */
const topScene = (container: HTMLElement, n: number) =>
  container.querySelectorAll<HTMLElement>(".scene:not(.scene--sub)")[n]!;

/** 這個區塊／場次自己的把手（區塊的 ⠿；場次的把手是場次號）。 */
const ownHandle = (el: HTMLElement) => el.querySelector<HTMLElement>(":scope > [data-drag-handle]")!;

/** 頂層每一場的內文（子場次以 `[…]` 標出）。 */
function outline(editor: Editor): string[][] {
  const out: string[][] = [];
  editor.state.doc.forEach((top) => {
    const row: string[] = [];
    top.forEach((c) => row.push(c.type.name === "subscene" ? `[${c.textContent}]` : c.textContent));
    out.push(row);
  });
  return out;
}

function drag(handle: HTMLElement) {
  const dt = dataTransfer();
  fireEvent.dragStart(handle, { dataTransfer: dt });
  return dt;
}

/**
 * 派發一個帶座標的拖放事件，回傳它有沒有被 `preventDefault()`。jsdom 沒有 `DragEvent`，
 * testing-library 退回一般 `Event`、把 `clientY` 丟掉 —— 自己補上。
 */
function fireDrag(
  type: "dragOver" | "drop",
  el: HTMLElement,
  clientY: number,
  dt: ReturnType<typeof dataTransfer>,
): boolean {
  const event = createEvent[type](el, { dataTransfer: dt });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "clientX", { value: 0 });
  return !fireEvent(el, event);
}

const over = (el: HTMLElement, clientY: number, dt: ReturnType<typeof dataTransfer>) =>
  fireDrag("dragOver", el, clientY, dt);
function drop(el: HTMLElement, clientY: number, dt: ReturnType<typeof dataTransfer>): boolean {
  let prevented = false;
  act(() => {
    prevented = fireDrag("drop", el, clientY, dt);
  });
  return prevented;
}

const indicator = () => document.querySelector<HTMLElement>(".drop-indicator");
const lineShown = () => !!indicator() && !indicator()!.hidden;

describe("拖曳排序：接上 ProseMirror 的事件", () => {
  it("區塊跨場次：拖到別場區塊的下半 → 接在它之後；搬空的那場補一個空動作區塊", async () => {
    const { editor, container } = await mount();
    const dt = drag(ownHandle(blockOf(container, "街上")));
    const target = blockOf(container, "夜").querySelector<HTMLElement>(".block__content")!;

    expect(over(target, 1, dt)).toBe(true);
    expect(lineShown()).toBe(true);
    expect(dt.dropEffect).toBe("move");

    expect(drop(target, 1, dt)).toBe(true);
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回來"], [""], ["夜", "街上"]]);
    expect(lineShown()).toBe(false);
  });

  it("帶子場次的主場次拖向別場的區塊之間：不畫線、照樣攔下預設放置、放下去什麼都不變", async () => {
    const { editor, container } = await mount();
    const before = editor.state.doc.toJSON();
    const dt = drag(ownHandle(topScene(container, 0)));
    const target = blockOf(container, "夜");

    expect(over(target, 1, dt)).toBe(true); // 仍 preventDefault：瀏覽器的預設放置不准發生
    expect(dt.dropEffect).toBe("none");
    expect(lineShown()).toBe(false);

    expect(drop(target, 1, dt)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it("升級：子場次拖到下一場外框的上半 → 變成兩場之間的主場次", async () => {
    const { editor, container } = await mount();
    const subscene = container.querySelector<HTMLElement>(".scene--sub")!;
    const dt = drag(ownHandle(subscene));
    const chips = topScene(container, 1).querySelector<HTMLElement>(".scene__chips")!;

    expect(over(chips, -1, dt)).toBe(true);
    expect(lineShown()).toBe(true);
    drop(chips, -1, dt);
    expect(outline(editor)).toEqual([["客廳", "回來"], ["回憶"], ["街上"], ["夜"]]);
  });

  it("降級：主場次拖進別場 → 放下時問種類，選了才搬；⌘Z 一步回來", async () => {
    const { editor, container } = await mount();
    const before = editor.state.doc.toJSON();
    const dt = drag(ownHandle(topScene(container, 2)));
    const target = blockOf(container, "客廳");

    expect(over(target, 1, dt)).toBe(true);
    drop(target, 1, dt);
    expect(editor.state.doc.toJSON()).toEqual(before); // 還沒選種類，什麼都沒動

    const pick = await waitFor(() => {
      const button = [...document.querySelectorAll<HTMLElement>(".scene-menu button")].find((b) =>
        b.textContent?.includes("接續"),
      );
      expect(button).toBeDefined();
      return button!;
    });
    act(() => {
      fireEvent.mouseDown(pick);
    });
    expect(outline(editor)).toEqual([["客廳", "[夜]", "[回憶]", "回來"], ["街上"]]);
    expect(editor.state.doc.child(0).child(1).attrs.kind).toBe("接續");

    act(() => {
      editor.commands.undo();
    });
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it("降級選單按 Esc：取消，不搬", async () => {
    const { editor, container } = await mount();
    const before = editor.state.doc.toJSON();
    const dt = drag(ownHandle(topScene(container, 2)));
    drop(blockOf(container, "客廳"), 1, dt);
    const menu = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(".scene-menu");
      expect(el).not.toBeNull();
      return el!;
    });
    act(() => {
      fireEvent.keyDown(menu, { key: "Escape" });
    });
    expect(document.querySelector(".scene-menu")).toBeNull();
    expect(editor.state.doc.toJSON()).toEqual(before);
  });

  it("落點從 drop 事件重算：中途的 dragleave 清不掉、指示線停在別處也照實際放下的位置搬", async () => {
    const { editor, container } = await mount();
    const dt = drag(ownHandle(blockOf(container, "夜")));
    expect(over(blockOf(container, "街上"), 1, dt)).toBe(true);
    // 滑過區塊內部的子元素會發 dragleave —— 不准把這次拖曳清掉
    const inner = blockOf(container, "街上").querySelector<HTMLElement>(".block__content")!;
    const leave = createEvent.dragLeave(inner, { dataTransfer: dt });
    Object.defineProperty(leave, "relatedTarget", { value: blockOf(container, "街上") });
    fireEvent(inner, leave);
    expect(lineShown()).toBe(true);

    drop(blockOf(container, "客廳"), -1, dt);
    expect(outline(editor)).toEqual([["夜", "客廳", "[回憶]", "回來"], ["街上"], [""]]);
  });

  it("拖曳把手不交給 ProseMirror：它不啟動自己的拖放（不會拖走選取的文字）", async () => {
    const { editor, container } = await mount();
    drag(ownHandle(blockOf(container, "街上")));
    expect(editor.view.dragging).toBeNull();
  });

  it("不是從把手開始的拖曳（例如拖選取的文字）不歸這裡管", async () => {
    const { container } = await mount();
    const dt = dataTransfer();
    over(blockOf(container, "夜"), 1, dt); // 要不要 preventDefault 是 ProseMirror 自己的事
    expect(dt.dropEffect).toBe("none");
    expect(lineShown()).toBe(false);
  });

  it("同一場裡搬、來源那場得在前面補一個空動作區塊：游標仍落在搬過去的那一個", async () => {
    const { editor, container } = await mount();
    const dt = drag(ownHandle(blockOf(container, "客廳")));
    drop(blockOf(container, "回來"), 1, dt);
    expect(outline(editor)[0]).toEqual(["", "[回憶]", "回來", "客廳"]);
    expect(editor.state.selection.$from.parent.textContent).toBe("客廳");
  });

  it("降級選單開著時 doc 變了：選了種類也不搬（落點已經過期）", async () => {
    const { editor, container } = await mount();
    const dt = drag(ownHandle(topScene(container, 2)));
    drop(blockOf(container, "客廳"), 1, dt);
    const pick = await waitFor(() => {
      const button = [...document.querySelectorAll<HTMLElement>(".scene-menu button")].find((b) =>
        b.textContent?.includes("接續"),
      );
      expect(button).toBeDefined();
      return button!;
    });
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("新", 2));
    });
    const changed = editor.state.doc.toJSON();
    act(() => {
      fireEvent.mouseDown(pick);
    });
    expect(editor.state.doc.toJSON()).toEqual(changed);
  });
});

describe("拖到捲動區上下緣：自動捲動（越靠邊越快）", () => {
  // 捲動區的可見範圍是 100～900。
  it("離邊緣還遠：不捲", () => {
    expect(edgeScrollStep(500, 100, 900)).toBe(0);
  });
  it("靠近下緣往下捲、靠近上緣往上捲", () => {
    expect(edgeScrollStep(880, 100, 900)).toBeGreaterThan(0);
    expect(edgeScrollStep(120, 100, 900)).toBeLessThan(0);
  });
  it("越靠邊越快；拖出捲動區外面以最快速度捲", () => {
    expect(edgeScrollStep(890, 100, 900)).toBeGreaterThan(edgeScrollStep(860, 100, 900));
    expect(edgeScrollStep(1000, 100, 900)).toBe(edgeScrollStep(900, 100, 900));
    expect(edgeScrollStep(0, 100, 900)).toBe(-edgeScrollStep(900, 100, 900));
  });
});

describe("點把手（沒拖）：選起那個節點、開選單", () => {
  const menuRows = () => [...document.querySelectorAll<HTMLElement>(".scene-menu button")].map((b) => b.textContent);
  const pick = (label: string) =>
    act(() => {
      fireEvent.mouseDown([...document.querySelectorAll<HTMLElement>(".scene-menu button")].find((b) => b.textContent === label)!);
    });

  it("區塊：整個區塊被選起來，選單列出轉成其他類型與刪除", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.textContent).toBe("街上");
    expect(menuRows()).toEqual(["轉成對白", "轉成插入畫面", "刪除這一行"]);
  });

  it("區塊選單：轉成對白", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    pick("轉成對白");
    expect(editor.state.doc.child(1).child(0).type.name).toBe("dialogue");
    expect(document.querySelector(".scene-menu")).toBeNull();
  });

  it("對白（React node view）：一樣選起整個區塊，反白的 class 掛在包著它的那層", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    pick("轉成對白");
    // React node view 晚一拍才畫出來
    const dialogue = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(".block--dialogue");
      expect(el).not.toBeNull();
      return el!;
    });
    act(() => {
      fireEvent.click(ownHandle(dialogue));
    });
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.type.name).toBe("dialogue");
    // editor.css 的 `.ProseMirror-selectednode > .block--dialogue` 靠這層畫底色
    expect(dialogue.parentElement!.classList.contains("ProseMirror-selectednode")).toBe(true);
  });

  it("區塊選單：刪除這一行（那場唯一的一行 → 場次留著、補一個空的動作區塊）", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    pick("刪除這一行");
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回來"], [""], ["夜"]]);
  });

  it("群組：整組被選起來，選單可以解散對剪", async () => {
    const m1 = k.node("groupMember", { sceneId: mintSceneId() });
    const m2 = k.node("groupMember", { sceneId: mintSceneId() });
    const fragment = (m: PMNode, text: string) => k.node("groupFragment", { memberId: m.attrs.sceneId }, [action(text)]);
    const content = k.node("doc", null, [
      scene([action("前")]),
      k.node("sceneGroup", { groupId: mintGroupId() }, [m1, m2, fragment(m1, "甲"), fragment(m2, "乙")]),
    ]).toJSON() as object;
    const { editor, container } = await mount(content);
    act(() => {
      fireEvent.click(ownHandle(container.querySelector<HTMLElement>(".scene-group")!));
    });
    expect((editor.state.selection as NodeSelection).node?.type.name).toBe("sceneGroup");
    pick("解散對剪（全部變回普通場次）");
    expect(editor.state.doc.childCount).toBe(3);
    editor.state.doc.forEach((top) => expect(top.type.name).toBe("scene"));
  });

  it("場次號（場次的把手）：選起整場、開 SceneMenu；選單收起之後整場仍選著（可以 ⌘C／⌘X／⌫）", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(topScene(container, 1)));
    });
    expect(menuRows()).toContain("刪除本場");
    const selected = () => (editor.state.selection as NodeSelection).node?.attrs.sceneId;
    expect(selected()).toBe(editor.state.doc.child(1).attrs.sceneId);
    act(() => {
      fireEvent.keyDown(document.querySelector(".scene-menu")!, { key: "Escape" });
    });
    expect(document.querySelector(".scene-menu")).toBeNull();
    expect(selected()).toBe(editor.state.doc.child(1).attrs.sceneId);
  });

  it("場次號選單刪除本場：游標落在接上來的那一場開頭，不跑到文件末端", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(topScene(container, 1)));
    });
    pick("刪除本場");
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回來"], ["夜"]]);
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.textContent).toBe("夜");
    expect(selection.$from.parentOffset).toBe(0);
  });

  it("刪的是最後一場：游標落在上一場的結尾", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(topScene(container, 2)));
    });
    pick("刪除本場");
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe("街上");
    expect($from.parentOffset).toBe("街上".length);
  });

  it("再點一次同一個把手：收起選單，區塊仍選著", async () => {
    const { editor, container } = await mount();
    const handle = ownHandle(blockOf(container, "街上"));
    act(() => {
      fireEvent.click(handle);
    });
    act(() => {
      fireEvent.click(handle);
    });
    expect(document.querySelector(".scene-menu")).toBeNull();
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("區塊選著時打字：覆蓋那一行的字，區塊與類型留著", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    act(() => {
      fireEvent.keyDown(document.querySelector(".scene-menu")!, { key: "Escape" });
    });
    act(() => {
      const { from, to } = editor.state.selection;
      editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, "巷", () => editor.state.tr));
    });
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回來"], ["巷"], ["夜"]]);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe("巷");
  });

  it("區塊選著時按 ⌫：刪掉那一行（那場唯一的一行 → 場次留著）", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "回來")));
    });
    act(() => {
      fireEvent.keyDown(document.querySelector(".scene-menu")!, { key: "Escape" });
    });
    act(() => {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
    });
    expect(outline(editor)).toEqual([["客廳", "[回憶]"], ["街上"], ["夜"]]);
  });
});

describe("選起的節點：剪貼簿與鍵盤都對它作用（`held-node`）", () => {
  /** jsdom 沒有 ClipboardEvent：自己帶一份 clipboardData。 */
  function clip(type: "copy" | "cut", target: Element) {
    const store = new Map<string, string>();
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (t: string, v: string) => store.set(t, v),
        getData: (t: string) => store.get(t) ?? "",
        clearData: () => store.clear(),
      },
    });
    act(() => {
      target.dispatchEvent(event);
    });
    return { html: store.get("text/html") ?? "", prevented: event.defaultPrevented };
  }

  const speaker = { id: mintCharacterId(), displayName: "阿盈" };
  const withDialogue = () =>
    k.node("doc", null, [
      scene([action("客廳"), k.node("dialogue", { character: speaker }, [k.text("你遲到十分鐘。")])]),
      scene([action("街上")]),
    ]).toJSON() as object;

  /** 點對白的 ⠿；回傳人物欄 —— 瀏覽器把 copy／cut 派給選取起點，選起對白時落在人物 chip 上。 */
  async function holdDialogue(container: HTMLElement) {
    const dialogue = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(".block--dialogue .block__speaker-field");
      expect(el).not.toBeNull();
      return el!.closest<HTMLElement>(".block--dialogue")!;
    });
    act(() => {
      fireEvent.click(ownHandle(dialogue));
    });
    const field = dialogue.querySelector<HTMLElement>(".block__speaker-field")!;
    // 瀏覽器裡它繼承編輯器的 contenteditable（Tiptap 的 stopEvent 因此把事件留給它）；jsdom 沒實作這個屬性。
    Object.defineProperty(field, "isContentEditable", { value: true });
    return field;
  }

  const pasteAtEndOf = (editor: Editor, sceneIndex: number, html: string) =>
    act(() => {
      let end = 0;
      editor.state.doc.forEach((_n, offset, i) => {
        if (i === sceneIndex) end = offset + _n.nodeSize - 2;
      });
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)));
      editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
    });

  it("對白 ⌘C（事件落在人物 chip 上）：複製的是對白本身，貼到別場還是同一個人的一句話", async () => {
    const { editor, container } = await mount(withDialogue());
    const chip = await holdDialogue(container);
    const { html, prevented } = clip("copy", chip);
    expect(prevented).toBe(true);
    pasteAtEndOf(editor, 1, html);
    const pasted = editor.state.doc.child(1).lastChild!;
    expect(pasted.type.name).toBe("dialogue");
    expect(pasted.attrs.character).toEqual(speaker);
    expect(pasted.textContent).toBe("你遲到十分鐘。");
  });

  it("對白 ⌘X：對白拿掉（DOM 交給 PM 改，不由瀏覽器拆），⌘Z 一步回來", async () => {
    const { editor, container } = await mount(withDialogue());
    clip("cut", await holdDialogue(container));
    expect(outline(editor)).toEqual([["客廳"], ["街上"]]);
    act(() => {
      editor.commands.undo();
    });
    expect(outline(editor)).toEqual([["客廳", "你遲到十分鐘。"], ["街上"]]);
  });

  it("選單開著時 ⌘X：照樣剪下，選單收起", async () => {
    const { editor, container } = await mount(withDialogue());
    const chip = await holdDialogue(container);
    expect(document.querySelector(".scene-menu")).not.toBeNull();
    clip("cut", chip);
    expect(outline(editor)).toEqual([["客廳"], ["街上"]]);
    expect(document.querySelector(".scene-menu")).toBeNull();
  });

  it("選單開著時按 ⌫：選單收起、那一行刪掉", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "回來")));
    });
    act(() => {
      fireEvent.keyDown(document.querySelector(".scene-menu")!, { key: "Backspace" });
    });
    expect(document.querySelector(".scene-menu")).toBeNull();
    expect(outline(editor)).toEqual([["客廳", "[回憶]"], ["街上"], ["夜"]]);
  });

  it("場次號選起整場 ⌘C → 貼上：多一場，拿到新的 sceneId", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(topScene(container, 1)));
    });
    // 選起整場時瀏覽器把 copy 派給 body（選取起點不在編輯器的元素裡）
    const { html } = clip("copy", document.body);
    pasteAtEndOf(editor, 2, html);
    expect(outline(editor)).toEqual([["客廳", "[回憶]", "回來"], ["街上"], ["夜"], ["街上"]]);
    expect(editor.state.doc.child(3).attrs.sceneId).not.toBe(editor.state.doc.child(1).attrs.sceneId);
  });

  it("整場 ⌘C → 貼上：場次 metadata（登場人物、不再提示的人物）一起帶過去", async () => {
    const who = { id: mintCharacterId(), displayName: "建鳴" };
    const dismissed = [mintCharacterId()];
    const { editor, container } = await mount(
      k.node("doc", null, [
        k.node("scene", { sceneId: mintSceneId(), appearingCharacters: [who], dismissedCharacterIds: dismissed }, [
          action("堤上"),
        ]),
        scene([action("街上")]),
      ]).toJSON() as object,
    );
    act(() => {
      fireEvent.click(ownHandle(topScene(container, 0)));
    });
    pasteAtEndOf(editor, 1, clip("copy", document.body).html);
    const copy = editor.state.doc.child(2);
    expect(copy.textContent).toBe("堤上");
    expect(copy.attrs.appearingCharacters).toEqual([who]);
    expect(copy.attrs.dismissedCharacterIds).toEqual(dismissed);
  });

  it("選單開著時點文件裡面：那一下只收起選單、仍選著（留一次複製、剪下的機會）；再點才交給編輯器", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    const elsewhere = blockOf(container, "夜").querySelector(".block__content")!;
    let passed = true;
    act(() => {
      fireEvent.pointerDown(elsewhere);
      passed = fireEvent.mouseDown(elsewhere);
    });
    expect(passed).toBe(false); // mousedown 被吃掉：PM 不會把選取換成游標
    expect(document.querySelector(".scene-menu")).toBeNull();
    expect((editor.state.selection as NodeSelection).node?.textContent).toBe("街上");
    // 第二下：到得了編輯器、沒被吃掉。看完就停 —— 再往下 PM 要量座標，jsdom 沒有版面。
    let reached = false;
    const peek = (e: Event) => {
      reached = !e.defaultPrevented;
      e.stopImmediatePropagation();
    };
    editor.view.dom.addEventListener("mousedown", peek, true);
    act(() => {
      fireEvent.pointerDown(elsewhere);
      fireEvent.mouseDown(elsewhere);
    });
    editor.view.dom.removeEventListener("mousedown", peek, true);
    expect(reached).toBe(true);
  });

  it("點頁面空白處（焦點掉到 body）：焦點拉回編輯器，仍選著", async () => {
    const { editor, container } = await mount();
    act(() => {
      fireEvent.click(ownHandle(blockOf(container, "街上")));
    });
    act(() => {
      fireEvent.keyDown(document.querySelector(".scene-menu")!, { key: "Escape" });
    });
    await act(async () => {
      (document.activeElement as HTMLElement).blur();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(editor.view.hasFocus()).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });
});
