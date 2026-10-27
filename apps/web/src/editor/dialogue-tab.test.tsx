// @vitest-environment jsdom
/**
 * §7.1 —— 人物欄的鍵盤行為。
 *
 * - Tab（**兩個方向**）都不能冒泡到 BlockCycle 把對白轉成別的型別／破壞欄位。
 * - Enter：打完人物名直接進台詞（不要「按了沒反應」的錯愕）——使用者回饋 2026-09-03。
 * - 對白內文按 Enter：起一段新對白，焦點落在**新那段的人物欄**（說話者重新指定）
 *   ——使用者回饋 2026-09-03（第三輪）。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mintCharacterId, mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { ScreenplayEditor } from "./ScreenplayEditor";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithDialogue() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
      ]),
    ])
    .toJSON() as object;
}

/** 動作在前、對白在後 —— 初始游標落在動作，好驗證 Enter 是否真的把游標跳進對白內文。 */
function docActionThenDialogue() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
        kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
      ]),
    ])
    .toJSON() as object;
}

function Harness({ onEditor, doc }: { onEditor: (e: Editor) => void; doc?: object }) {
  const editor = useScreenplayEditor(doc ?? docActionThenDialogue());
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

describe("人物欄的 Tab 不冒泡到 BlockCycle", () => {
  afterEach(() => {
    cleanup();
  });

  it("Shift+Tab 在人物欄不會把對白轉回動作", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithDialogue()} />);
    await waitFor(() => expect(container.querySelector(".block--dialogue")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    expect(speaker).not.toBeNull();
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "Tab", shiftKey: true });
    fireEvent.keyDown(speaker, { key: "Tab" });

    // 區塊仍是對白，且沒有多長出場次
    expect(container.querySelector(".block--dialogue")).not.toBeNull();
    expect(container.querySelector(".block--action")).toBeNull();
    expect(container.querySelectorAll(".scene").length).toBe(1);
  });
});

describe("人物欄按 Enter 直接進台詞", () => {
  afterEach(() => {
    cleanup();
  });

  it("Enter 把游標送進對白內文（不再是按了沒反應）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "Enter" });

    // jsdom 下 editor.chain().focus() 不搬 DOM 焦點，改查 ProseMirror selection。
    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.type.name).toBe("dialogue");
    });
  });

  it("對白內文按 Enter：起一段新對白，焦點落在新那段的人物欄", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block--dialogue")).not.toBeNull());

    // 游標放進「還有位子嗎？」這段對白內文尾端（action nodeSize + 進 dialogue + 內容長度）。
    const scene = editor.state.doc.child(0);
    const dialogueBodyEnd = 1 + scene.child(0).nodeSize + 1 + scene.child(1).content.size;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.near(editor.state.doc.resolve(dialogueBodyEnd)),
      ),
    );

    editor.commands.keyboardShortcut("Enter");

    // 原本的對白之後多了一段對白（前面那個 action 不動）。
    await waitFor(() => expect(container.querySelectorAll(".block--dialogue").length).toBe(2));
    const scene2 = editor.state.doc.child(0);
    expect([scene2.child(1).type.name, scene2.child(2).type.name]).toEqual(["dialogue", "dialogue"]);
    expect(scene2.child(2).attrs.character).toBeNull(); // 新那段說話者清空

    // 焦點落在新那段（第二個）的人物欄。
    const speakers = container.querySelectorAll<HTMLInputElement>(".block__speaker");
    await waitFor(() => expect(document.activeElement).toBe(speakers[speakers.length - 1]));
  });

  it("組字中的 Enter 不動作（isComposing）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "Enter", isComposing: true });

    // 游標沒有被搬進對白內文（維持在初始的動作區塊）。
    expect(editor.state.selection.$from.parent.type.name).toBe("action");
  });
});

/**
 * 上下方向鍵的垂直動線（使用者回饋 2026-09-04）——人物欄是 DOM `<input>`，不在 ProseMirror
 * 的位置空間裡，兩個方向都得自己接：文件側在 `extensions/vertical-nav`，欄位側在 node view。
 */
describe("人物欄與台詞之間的上下導航", () => {
  afterEach(() => {
    cleanup();
  });

  it("人物欄按 ↓：回到自己的台詞，游標在文字末端", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "ArrowDown" });

    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.type.name).toBe("dialogue");
      expect($from.parentOffset).toBe("還有位子嗎？".length);
    });
  });

  it("人物欄按 ↑：到上一個區塊（動作）的文字末端", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "ArrowUp" });

    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.type.name).toBe("action");
      expect($from.parentOffset).toBe("門開了".length);
    });
  });

  // ← 是 ↑ 的水平對應（票券 61）：在人物欄最前面再往左，就是走出這一格去上一個區塊 ——
  // 與 chip row 第一排 ←／↑ 共用出口同一條規則。
  it("空的人物欄按 ←：到上一個區塊（動作）的文字末端，與 ↑ 同一個落點", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    expect(fireEvent.keyDown(speaker, { key: "ArrowLeft" })).toBe(false); // 攔下來了

    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.type.name).toBe("action");
      expect($from.parentOffset).toBe("門開了".length);
    });
  });

  // ← 那一半早就有了（台詞第一個字之前 ← 回人物欄，見下一條）。→ 是它的反向 ——
  // 缺了就是「過得去回不來」（§7.3 的環不變式）。使用者回饋 2026-09-10 第三輪。
  it("人物欄按 →（游標貼著字尾）：進台詞的**開頭**", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "ArrowRight" });

    await waitFor(() => {
      const { $from, empty } = editor.state.selection;
      expect(empty).toBe(true);
      expect($from.parent.type.name).toBe("dialogue");
      expect($from.parentOffset).toBe(0); // 開頭，不是末端（那是 ↓）
    });
  });

  it("人物欄裡還有字要讀時，→ 屬於那串字", async () => {
    const { container } = render(<Harness onEditor={() => {}} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    speaker.focus();
    fireEvent.change(speaker, { target: { value: "小明" } });
    speaker.setSelectionRange(1, 1); // 兩個字中間

    expect(fireEvent.keyDown(speaker, { key: "ArrowRight" })).toBe(true); // 沒被攔
    expect(document.activeElement).toBe(speaker);
  });

  it("台詞第一行按 ↑：焦點回到人物欄（補填人名）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block__speaker")).not.toBeNull());

    // 游標放進台詞開頭。
    const scene = editor.state.doc.child(0);
    const bodyStart = 1 + scene.child(0).nodeSize + 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(bodyStart))),
    );

    // 真的派一顆 keydown（走瀏覽器同一條路徑）——`commands.keyboardShortcut` 會包
    // captureTransaction，與這裡「不改 doc、只搬焦點」的行為對不上。
    // DOM 焦點也要先給編輯器：`vertical-nav` 靠 `activeElement` 分辨這顆鍵是文件的還是
    // node view 某個欄位的（那些欄位就在 `view.dom` 裡，方向鍵照樣冒泡過來）。掛載後的
    // 初始焦點在 chip row 上，不補這一步等於在模擬別的情境。
    editor.view.dom.focus();
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );

    const speaker = container.querySelector<HTMLInputElement>(".block__speaker")!;
    await waitFor(() => expect(document.activeElement).toBe(speaker));
  });
});

describe("空的對白在人物欄按 Enter：取消區塊，變回描述", () => {
  afterEach(() => {
    cleanup();
  });

  it("人名與台詞都空 → Enter 把對白換成 action", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelector(".block--dialogue")).not.toBeNull());

    // 先在對白內文尾端按 Enter，起一段全新的空對白（焦點會落在它的人物欄）。
    const scene = editor.state.doc.child(0);
    const bodyEnd = 1 + scene.child(0).nodeSize + 1 + scene.child(1).content.size;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(bodyEnd))),
    );
    editor.commands.keyboardShortcut("Enter");
    await waitFor(() => expect(container.querySelectorAll(".block--dialogue").length).toBe(2));

    const speakers = container.querySelectorAll<HTMLInputElement>(".block__speaker");
    const fresh = speakers[speakers.length - 1]!;
    await waitFor(() => expect(document.activeElement).toBe(fresh));

    // 什麼都沒打就 Enter → 這一段取消，回到描述。
    fireEvent.keyDown(fresh, { key: "Enter" });

    await waitFor(() => expect(container.querySelectorAll(".block--dialogue").length).toBe(1));
    const after = editor.state.doc.child(0);
    expect([after.child(1).type.name, after.child(2).type.name]).toEqual(["dialogue", "action"]);
  });
});

describe("人物欄最前面按 ← 走出這一格（票券 61）", () => {
  afterEach(() => {
    cleanup();
  });

  /** 動作在前、對白在後，對白已經有一個人物 —— 人物欄裡有一顆 chip 可以走。 */
  function docWithSpeaker() {
    return kernelSchema
      .node("doc", null, [
        kernelSchema.node("scene", { sceneId: mintSceneId() }, [
          kernelSchema.node("action", null, [kernelSchema.text("門開了")]),
          kernelSchema.node("dialogue", { character: { id: mintCharacterId(), displayName: "小明" } }, [
            kernelSchema.text("還有位子嗎？"),
          ]),
        ]),
      ])
      .toJSON() as object;
  }

  async function mount(doc: object) {
    let editor!: Editor;
    const { container } = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
    const speaker = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(".block__speaker");
      expect(el).not.toBeNull();
      return el!;
    });
    return { container, speaker, editor: () => editor };
  }

  const atActionEnd = (editor: Editor) => {
    const { $from, empty } = editor.state.selection;
    return empty && $from.parent.type.name === "action" && $from.parentOffset === "門開了".length;
  };

  it("有 chip 時：← 先走完 chip 與它左邊那道縫，再一下才去上一個區塊的文字末端", async () => {
    const { container, speaker, editor } = await mount(docWithSpeaker());
    const chip = container.querySelector<HTMLElement>(".block__speaker-field .entity-chip")!;

    speaker.focus();
    fireEvent.keyDown(speaker, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(chip);

    fireEvent.keyDown(chip, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(speaker); // 游標插進第一顆左邊那道縫

    fireEvent.keyDown(speaker, { key: "ArrowLeft" });
    await waitFor(() => expect(atActionEnd(editor())).toBe(true));
  });

  it("站在第一顆 chip 上、左邊那道縫已經走過：← 直接去上一個區塊", async () => {
    const { container, speaker, editor } = await mount(docWithSpeaker());
    const chip = container.querySelector<HTMLElement>(".block__speaker-field .entity-chip")!;

    // 走到縫上（`| 小明`），再 → 回到那一顆 —— 輸入框留在它左邊，那道縫算是走過了。
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "ArrowLeft" });
    fireEvent.keyDown(chip, { key: "ArrowLeft" });
    fireEvent.keyDown(speaker, { key: "ArrowRight" });
    expect(document.activeElement).toBe(chip);

    fireEvent.keyDown(chip, { key: "ArrowLeft" });
    await waitFor(() => expect(atActionEnd(editor())).toBe(true));
  });

  // 用空欄位：已經有一位時打的第二個名字要先問過（齊聲確認），離開欄位不是答案、不定案 ——
  // 那是 entity-field 自己的規則，不歸這張票。
  it("打到一半的字、游標在字首：← 照樣走出去，那串字定案成 chip", async () => {
    const { container, speaker, editor } = await mount(docActionThenDialogue());
    speaker.focus();
    fireEvent.change(speaker, { target: { value: "小華" } });
    speaker.setSelectionRange(0, 0);

    fireEvent.keyDown(speaker, { key: "ArrowLeft" });
    await waitFor(() => expect(atActionEnd(editor())).toBe(true));
    await waitFor(() =>
      expect(
        [...container.querySelectorAll(".block__speaker-field .entity-chip")].map((c) =>
          c.textContent?.replace(/[×＋📍👤👥]/gu, "").trim(),
        ),
      ).toEqual(["小華"]),
    );
    // 定案是整份 replace —— 游標要留在上一個區塊，不能被沖到文件尾端（台詞）。驗收回饋 2026-10-27。
    expect(atActionEnd(editor())).toBe(true);
  });

  it("字中間的 ← 屬於那串字，不走出去", async () => {
    const { speaker } = await mount(docWithSpeaker());
    speaker.focus();
    fireEvent.change(speaker, { target: { value: "小華" } });
    speaker.setSelectionRange(1, 1);

    expect(fireEvent.keyDown(speaker, { key: "ArrowLeft" })).toBe(true); // 沒被攔
    expect(document.activeElement).toBe(speaker);
  });

  // ⌘← 是「走到這一格最前面」（`chip-caret`），⇧← 是延伸反白、⌥← 是逐詞 —— 都不是走出去。
  // chip row 那幾格的 ⌘ ＋ 左右同樣不跳格（`chip-nav`）。
  it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }])(
    "空的人物欄按 %o ＋ ←：不走出去",
    async (modifier) => {
      const { speaker } = await mount(docActionThenDialogue());
      speaker.focus();

      expect(fireEvent.keyDown(speaker, { key: "ArrowLeft", ...modifier })).toBe(true); // 沒被攔
      expect(document.activeElement).toBe(speaker);
    },
  );

  it("手上握著一筆在改、游標在字首：← 走出去，那一筆放回原位", async () => {
    const { container, speaker, editor } = await mount(docWithSpeaker());
    const chip = container.querySelector<HTMLElement>(".block__speaker-field .entity-chip")!;

    // chip 上按 Enter ＝ 拿起來改（字回到框裡、整串反白），再把游標收到字首。
    speaker.focus();
    fireEvent.keyDown(speaker, { key: "ArrowLeft" });
    fireEvent.keyDown(chip, { key: "Enter" });
    await waitFor(() => expect(speaker.value).toBe("小明"));
    speaker.setSelectionRange(0, 0);

    fireEvent.keyDown(speaker, { key: "ArrowLeft" });
    await waitFor(() => expect(atActionEnd(editor())).toBe(true));
    await waitFor(() =>
      expect(
        [...container.querySelectorAll(".block__speaker-field .entity-chip")].map((c) =>
          c.textContent?.replace(/[×＋📍👤👥]/gu, "").trim(),
        ),
      ).toEqual(["小明"]),
    );
    expect(atActionEnd(editor())).toBe(true);
  });
});
