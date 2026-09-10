// @vitest-environment jsdom
/**
 * 票券 34 —— chip row 與場次內文之間的**方向鍵**往返。
 *
 * Tab 那條路是單向的（metadata 一格一格串進內文，進去就回不來），因為 chip row 是
 * `contentEditable={false}`，ProseMirror 的游標進不去。這裡釘住補上的那條雙向路。
 *
 * **模型（使用者驗收回饋 2026-09-10 後修訂）**：chip row 在畫面上是二維的 ——
 *
 * ```
 * 第 1 排  [內外] [時間] [地點——————————]
 * 第 2 排  [登場人物——————————————————]
 * 第 3 排  [群演————————————————————]
 * ```
 *
 * —— 所以方向鍵在這一排的意思就是**移到隔壁那一格**，走到邊界才越界（上一場內文末端／
 * 本場內文開頭）。原本設計成「↓ 一律離開 chip row」，結果格子之間根本沒有路。
 *
 * 三條例外，各有理由：
 * - **下拉那兩格的 ↓ 歸選單**（選單本來就往下展）。要往下走先 → 到地點格。
 * - **輸入框的 ←→ 要游標貼著字首／字尾**才跳格 —— 還有字要讀時方向鍵屬於那串字。
 * - **自動補全選單開著時 ↑↓ 是選單的** —— 只有選單關著才輪到導航。
 *
 * Tab／Shift+Tab 的環一個字都沒改（§7.3）：環要能按回來，讓它在某個位置離開就不對稱了。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const scene = (blocks: unknown[]) =>
  kernelSchema.node("scene", { sceneId: mintSceneId() }, blocks as never);

const action = (text: string) => kernelSchema.node("action", null, [kernelSchema.text(text)]);
const dialogue = (text: string) =>
  kernelSchema.node("dialogue", { character: null }, [kernelSchema.text(text)]);

const docJSON = (...scenes: unknown[]) =>
  kernelSchema.node("doc", null, scenes as never).toJSON() as object;

function Harness({ doc, onEditor }: { doc: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

/** 把游標放進第 `sceneIndex` 場第一個區塊的內文（開頭）。 */
function caretInFirstBlock(editor: Editor, sceneIndex = 0) {
  let pos = 0;
  editor.state.doc.forEach((node, offset, index) => {
    if (index === sceneIndex) pos = offset + 2;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))),
  );
}

/** 游標放到第 `sceneIndex` 場**最後一個區塊的末端** —— 往下／往右越界的起點。 */
function caretAtSceneEnd(editor: Editor, sceneIndex = 0) {
  let pos = 0;
  editor.state.doc.forEach((node, offset, index) => {
    if (index === sceneIndex) pos = offset + node.nodeSize - 2;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos), -1)),
  );
}

/**
 * 走瀏覽器同一條路徑派一顆方向鍵到編輯器（`keyboardShortcut` 會包 transaction，對不上）。
 *
 * 先把 DOM 焦點交給編輯器 —— 使用者要按這顆鍵，游標本來就在文件裡。`vertical-nav` 靠這件事
 * 分辨「這顆鍵是文件的」還是「chip row 某一格的」（那些欄位就在 `view.dom` 裡面，它們的方向鍵
 * 照樣會冒泡過來）。掛載後的初始焦點在內外格上，不補這一步就等於在模擬別的情境。
 */
function pressInBody(editor: Editor, key: string) {
  editor.view.dom.focus();
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

const sceneAt = (container: HTMLElement, i: number) =>
  container.querySelectorAll<HTMLElement>(".scene")[i]!;

/** chip row 的一格 —— 用無障礙標籤定位，不靠排列順序。 */
const cell = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLElement>(`.scene__chips [aria-label="${label}"]`)!;

const extrasInput = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>(".scene__chip--extras input")!;

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(doc: object) {
  let editor!: Editor;
  const { container } = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(container.querySelector(".scene__chip--extras input")).not.toBeNull());
  return { container, editor: () => editor };
}

/** 游標落在某一場的內文裡了嗎（而不是還在 DOM 欄位上）。 */
const caretInBodyOf = (editor: Editor, text: string) => {
  const { $from, empty } = editor.state.selection;
  return empty && $from.parent.textContent === text;
};

describe("chip row 內部：方向鍵走到隔壁那一格", () => {
  // 版面是二維的，所以「隔壁」不只是左右。這張表就是 chip row 的鍵位規格 ——
  // 每一格的每一個方向都列出來，沒有哪一格是死路（使用者驗收回饋：群演往上到不了
  // 登場人物、登場人物到不了地點、地點往左過不去）。
  it.each([
    ["內外", "ArrowRight", "時間"],
    ["時間", "ArrowLeft", "內外"],
    ["時間", "ArrowRight", "地點"],
    ["地點", "ArrowLeft", "時間"],
    ["地點", "ArrowRight", "登場人物"],
    ["地點", "ArrowDown", "登場人物"],
    ["登場人物", "ArrowLeft", "地點"],
    ["登場人物", "ArrowUp", "地點"],
    ["登場人物", "ArrowRight", "群演"],
    ["登場人物", "ArrowDown", "群演"],
    ["群演", "ArrowLeft", "登場人物"],
    ["群演", "ArrowUp", "登場人物"],
  ])("%s 按 %s → %s", async (from, key, to) => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const start = cell(container, from);
    start.focus();
    fireEvent.keyDown(start, { key });

    await waitFor(() => expect(document.activeElement).toBe(cell(container, to)));
  });

  it("空欄位的 ← 和 → 都算「貼著端點」—— 兩邊都走得出去", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const characters = cell(container, "登場人物") as HTMLInputElement;
    expect(characters.value).toBe("");
    characters.focus();
    fireEvent.keyDown(characters, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cell(container, "地點")));
  });

  it("字中間的 ←→ 屬於那串字，不跳格", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const characters = cell(container, "登場人物") as HTMLInputElement;
    characters.focus();
    fireEvent.change(characters, { target: { value: "小明" } });
    characters.setSelectionRange(1, 1); // 兩個字中間

    // 兩顆都不該被攔（回傳 true ＝ 沒有 preventDefault），焦點也不動。
    expect(fireEvent.keyDown(characters, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(characters, { key: "ArrowRight" })).toBe(true);
    expect(document.activeElement).toBe(characters);
  });

  it("有反白時的 ←→ 是收起反白，不跳格", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const characters = cell(container, "登場人物") as HTMLInputElement;
    characters.focus();
    fireEvent.change(characters, { target: { value: "小明" } });
    characters.setSelectionRange(0, 2); // 整串反白：start 在 0，但不是游標貼著字首

    expect(fireEvent.keyDown(characters, { key: "ArrowLeft" })).toBe(true);
    expect(document.activeElement).toBe(characters);
  });

  it("下拉那兩格的 ↓ 歸選單 —— 不是導航（使用者裁決 2026-09-10）", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    for (const label of ["內外", "時間"]) {
      const trigger = cell(container, label);
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "ArrowDown" });

      expect(container.querySelector(".chip-select__menu")).not.toBeNull();
      expect(document.activeElement).toBe(trigger); // 沒有跳去別格
      fireEvent.keyDown(trigger, { key: "Escape" });
    }
  });
});

// 使用者回饋 2026-09-10 第三輪：「metadata 感覺在 chip 確認後，按 Enter 也可以切換成下一個
// 欄位」、「要選定一組直觀的快捷鍵，讓使用者可以直接跳從 metadata 的任意位置，直接跳到內容
// 區塊上」。Enter ＝ 這一格好了去下一格（與 Tab 同終點，只是不看游標在哪）；
// ⌘↑／⌘↓ ＝ 一路走到底，直接離開整排。
describe("Enter 換下一格，⌘↑↓ 直接離開整排", () => {
  it.each([
    ["內外", "時間"],
    ["時間", "地點"],
    ["地點", "登場人物"],
    ["登場人物", "群演"],
  ])("%s 按 Enter → %s", async (from, to) => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const start = cell(container, from);
    start.focus();
    fireEvent.keyDown(start, { key: "Enter" });

    await waitFor(() => expect(document.activeElement).toBe(cell(container, to)));
    expect(container.querySelector(".chip-select__menu")).toBeNull(); // Enter 不再開選單
  });

  it("下拉那兩格的選單改由 Space／↓ 開 —— Enter 讓給「下一格」", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const trigger = cell(container, "內外");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: " " });
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
  });

  it("群演欄按 Enter → 進本場內文（這一排到此為止）", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));
    editor().commands.setTextSelection(1);

    const input = extrasInput(container);
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(caretInBodyOf(editor(), "門開了")).toBe(true));
  });

  it("還有字沒定案時，第一次 Enter 是把字切成 chip；再一次才換格", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const input = extrasInput(container);
    input.focus();
    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(container.querySelector(".scene__chip--extras .entity-chip")).not.toBeNull(),
    );
    expect(document.activeElement).toBe(input); // 還在這一格
  });

  it.each(["內外", "時間", "地點", "登場人物", "群演"])(
    "%s 按 ⌘↓ → 直接進本場內文",
    async (label) => {
      const { container, editor } = await mount(docJSON(scene([action("門開了")])));
      editor().commands.setTextSelection(1);

      const start = cell(container, label);
      start.focus();
      fireEvent.keyDown(start, { key: "ArrowDown", metaKey: true });

      await waitFor(() => expect(caretInBodyOf(editor(), "門開了")).toBe(true));
    },
  );

  it.each(["內外", "時間", "地點", "登場人物", "群演"])(
    "%s 按 ⌘↑ → 直接回上一場內文末端",
    async (label) => {
      const { container, editor } = await mount(
        docJSON(scene([action("第一場")]), scene([action("第二場")])),
      );

      const start = cell(sceneAt(container, 1), label);
      start.focus();
      fireEvent.keyDown(start, { key: "ArrowUp", metaKey: true });

      await waitFor(() => {
        const { $from } = editor().state.selection;
        expect($from.parent.textContent).toBe("第一場");
        expect($from.parentOffset).toBe(3);
      });
    },
  );

  it("第一場沒有上一場：⌘↑ 原封還給瀏覽器", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const start = cell(container, "地點");
    start.focus();
    expect(fireEvent.keyDown(start, { key: "ArrowUp", metaKey: true })).toBe(true);
    expect(document.activeElement).toBe(start);
  });
});

describe("chip row ↔ 本場內文", () => {
  it("群演欄按 ↓／→ → 游標進本場第一個區塊", async () => {
    for (const key of ["ArrowDown", "ArrowRight"]) {
      const { container, editor } = await mount(docJSON(scene([action("門開了")])));

      // 游標先擺在別處，才看得出這一顆真的把它搬回第一個區塊。
      editor().commands.setTextSelection(1);
      const input = extrasInput(container);
      input.focus();
      fireEvent.keyDown(input, { key });

      await waitFor(() => expect(caretInBodyOf(editor(), "門開了")).toBe(true));
      document.body.innerHTML = "";
    }
  });

  it("第一個區塊的第一行按 ↑ → 焦點落在本場群演欄，內容一個字都沒變", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    const before = JSON.stringify(editor().getJSON());
    caretInFirstBlock(editor());
    pressInBody(editor(), "ArrowUp");

    await waitFor(() => expect(document.activeElement).toBe(extrasInput(container)));
    expect(JSON.stringify(editor().getJSON())).toBe(before);
  });

  it("第一個字之前按 ← → 同樣回群演欄（↑ 的水平對應）", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    caretInFirstBlock(editor());
    pressInBody(editor(), "ArrowLeft");

    await waitFor(() => expect(document.activeElement).toBe(extrasInput(container)));
  });

  it("非第一場：↑ 進的是**本場** chip row，不是上一場內文", async () => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([action("第二場")])),
    );

    caretInFirstBlock(editor(), 1);
    pressInBody(editor(), "ArrowUp");

    await waitFor(() => expect(document.activeElement).toBe(extrasInput(sceneAt(container, 1))));
  });

  it("第一個區塊是對白時：台詞 ↑ 進人物欄，人物欄再 ↑ 進本場 chip row（不跨到上一場）", async () => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([dialogue("還有位子嗎？")])),
    );

    caretInFirstBlock(editor(), 1);
    pressInBody(editor(), "ArrowUp");

    const speaker = sceneAt(container, 1).querySelector<HTMLInputElement>(".block__speaker")!;
    await waitFor(() => expect(document.activeElement).toBe(speaker));

    fireEvent.keyDown(speaker, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).toBe(extrasInput(sceneAt(container, 1))));
  });

  it("第二場的群演欄按 ↓ → 進的是第二場的內文", async () => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([action("第二場")])),
    );

    const input = extrasInput(sceneAt(container, 1));
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() => expect(caretInBodyOf(editor(), "第二場")).toBe(true));
  });
});

// 這一段與上一段互為反向 —— 缺任何一半就是「過得去回不來」（§7.3 的環不變式）。
describe("跨場次：chip row 第一排 ↔ 上一場內文末端", () => {
  // ↑ 是第一排**三格都**出界（正上方就是上一場）；← 只有最左邊那一格 ——
  // 時間 ← 去內外、地點 ← 去時間，那是格線導航，在上一段釘住了。
  it.each([
    ["內外", "ArrowUp"],
    ["內外", "ArrowLeft"],
    ["時間", "ArrowUp"],
    ["地點", "ArrowUp"],
  ])("%s 按 %s → 游標落在上一場內文的末端", async (label, key) => {
    const { container, editor } = await mount(
      docJSON(scene([action("第一場")]), scene([action("第二場")])),
    );

    const start = cell(sceneAt(container, 1), label);
    start.focus();
    fireEvent.keyDown(start, { key });

    await waitFor(() => {
      const { $from } = editor().state.selection;
      expect($from.parent.textContent).toBe("第一場");
      expect($from.parentOffset).toBe(3); // 末端，不是開頭
    });
  });

  it.each(["ArrowDown", "ArrowRight"])(
    "上一場內文末端按 %s → 回到下一場 chip row 的第一格（內外）",
    async (key) => {
      const { container, editor } = await mount(
        docJSON(scene([action("第一場")]), scene([action("第二場")])),
      );

      caretAtSceneEnd(editor(), 0);
      pressInBody(editor(), key);

      await waitFor(() =>
        expect(document.activeElement).toBe(cell(sceneAt(container, 1), "內外")),
      );
    },
  );

  // 使用者驗收回饋 2026-09-10（第三輪）：「上一場末端往下，會直接到這場的內容區塊而非
  // metadata 區塊」。`view.endOfTextblock()` 讀的是 `getClientRects()` 的實際版面，落在區塊
  // 末端時它並不是每次都答得出 `true`。端點這件事不必問版面 —— `parentOffset` 就是答案，
  // 所以 `vertical-nav` 兩條判準取聯集。這裡把版面查詢整個關掉，逼出那條不看版面的路。
  it.each(["ArrowDown", "ArrowRight"])(
    "版面查詢答不出來時，%s 一樣回得到下一場的 chip row（游標貼著區塊字尾就夠了）",
    async (key) => {
      const { container, editor } = await mount(
        docJSON(scene([action("第一場")]), scene([action("第二場")])),
      );
      editor().view.endOfTextblock = () => false;

      caretAtSceneEnd(editor(), 0);
      pressInBody(editor(), key);

      await waitFor(() =>
        expect(document.activeElement).toBe(cell(sceneAt(container, 1), "內外")),
      );
    },
  );

  it("第一區塊的第一行 ↑ 同理 —— 貼著字首就算，不必問版面", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));
    editor().view.endOfTextblock = () => false;

    caretInFirstBlock(editor());
    pressInBody(editor(), "ArrowUp");

    await waitFor(() => expect(document.activeElement).toBe(extrasInput(container)));
  });

  it("第一場的 chip row 往上沒有去處 —— 那顆鍵原封還給瀏覽器", async () => {
    const { container } = await mount(docJSON(scene([action("第一場")])));

    const start = cell(container, "內外");
    start.focus();
    // 沒有上一場：不 preventDefault，焦點不動。
    expect(fireEvent.keyDown(start, { key: "ArrowUp" })).toBe(true);
    expect(document.activeElement).toBe(start);
  });

  it("最後一場的內文末端往下沒有去處 —— 游標留在原地", async () => {
    const { editor } = await mount(docJSON(scene([action("唯一一場")])));

    caretAtSceneEnd(editor(), 0);
    const before = editor().state.selection.from;
    pressInBody(editor(), "ArrowDown");

    expect(editor().state.selection.from).toBe(before);
  });
});

describe("離開欄位不吃掉打到一半的字", () => {
  // Esc 只關選單、字留在框裡（`EntityField` 的「現在別煩我」）。那之後按 ↓ 離開欄位，
  // 走的是與 Tab 相同的那條 blur 回寫 —— 打完就走是常態，不該把字吃掉。
  it("群演欄：Esc 關掉選單後按 ↓，那串字仍然定案成 chip", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const input = extrasInput(container);
    input.focus();
    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() =>
      expect(container.querySelector(".scene__chip--extras .entity-chip")?.textContent).toContain(
        "咖啡廳客人",
      ),
    );
  });
});

describe("選單開著時，上下鍵是選單的", () => {
  it("群演欄：選單開著按 ↓ 不離開欄位", async () => {
    const { container, editor } = await mount(docJSON(scene([action("門開了")])));

    const input = extrasInput(container);
    input.focus();
    fireEvent.change(input, { target: { value: "咖啡廳客人 x8" } });
    await waitFor(() =>
      expect(container.querySelector(".scene__chip--extras .entity-field__menu")).not.toBeNull(),
    );

    const selectionBefore = editor().state.selection.from;
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(document.activeElement).toBe(input);
    expect(editor().state.selection.from).toBe(selectionBefore);
  });

  it("登場人物欄：選單開著按 ↑／↓ 移動選項，不跳去隔壁那一格", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const input = cell(container, "登場人物") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "小明" } });
    await waitFor(() =>
      expect(container.querySelector(".scene__chip--character .entity-field__menu")).not.toBeNull(),
    );

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(document.activeElement).toBe(input);
  });

  it("內外景下拉：選單開著時 ↑↓ 移動選項而不是走格線", async () => {
    const { container } = await mount(docJSON(scene([action("門開了")])));

    const trigger = cell(container, "內外");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" }); // 開選單
    expect(container.querySelector(".chip-select__menu")).not.toBeNull();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });

    expect(container.querySelector(".chip-select__menu")).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
