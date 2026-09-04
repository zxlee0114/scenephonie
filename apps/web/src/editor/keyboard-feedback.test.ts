// @vitest-environment jsdom
/**
 * 使用者回饋 2026-09-03 的鍵盤回歸樁（headless）：
 *  - `Shift+Enter` 在同一區塊內軟換行（`\n` 文字，非 hardBreak 節點）——`extensions/soft-break`。
 *    另驗 `\n` 原封不動進入 canonical document（`schema.nodeFromJSON` 往返後仍是單一 text 節點）。
 *  - `Enter` 延續當前區塊型別（描述接描述、對白接對白、插入畫面接插入畫面）——`extensions/
 *    continue-block`。對白的新那段說話者清空（要重新指定）。換型別是 Tab／`/` 選單的意圖。
 *  - 例外：**還什麼都沒寫**的對白／插入畫面按 `Enter` ＝ 取消型別、退回描述（選錯型別的退路）。
 *
 * 用無 React 根的 headless Editor：`InsertShotNode` 是原生 ProseMirror node view（靜態外殼），
 * 不需要 React；`Scene`／`Action`／`Dialogue` 用 schema-only 版本。
 */
import { Editor } from "@tiptap/core";
import { DOMParser } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { docFromJSON, mintSceneId } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { ContinueBlock } from "./extensions/continue-block";
import { InsertShotNode } from "./nodes/blocks";
import { Action, Dialogue, Doc, Scene } from "./schema";
import { SceneIds } from "./extensions/scene-ids";
import { SoftBreak } from "./extensions/soft-break";
import { toPlainJson } from "./plain-json";
import { baseStarterKit } from "./starter-kit";

let editor: Editor;
afterEach(() => editor?.destroy());

function build(blocks: object[]) {
  editor = new Editor({
    extensions: [
      baseStarterKit(),
      Doc,
      Scene,
      Action,
      Dialogue,
      InsertShotNode,
      SceneIds,
      SoftBreak,
      ContinueBlock,
    ],
    content: {
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: mintSceneId() }, content: blocks }],
    },
  });
  return editor;
}

function blockTypes() {
  const t: string[] = [];
  editor.state.doc.child(0).forEach((n) => t.push(n.type.name));
  return t;
}

/** 游標放到第 `i` 個區塊內文尾端。 */
function caretAtEndOfBlock(i: number) {
  const scene = editor.state.doc.child(0);
  let pos = 2; // doc>scene>block content start
  for (let k = 0; k < i; k++) pos += scene.child(k).nodeSize;
  pos += scene.child(i).content.size;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))));
}

describe("Shift+Enter：同一區塊內軟換行", () => {
  it("插入 \\n（單一 text 節點），且原封不動進入 canonical document", () => {
    build([{ type: "action", content: [{ type: "text", text: "走進門" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Shift-Enter");
    editor.commands.insertContent("關上門");

    expect(blockTypes()).toEqual(["action"]); // 沒有切出新區塊
    const block = editor.state.doc.child(0).child(0);
    expect(block.childCount).toBe(1); // 仍是一個 text 節點
    expect(block.textContent).toBe("走進門\n關上門");

    // 讀取邊界（kernel schema）：hydrate 不丟例外，且 `\n` 沒有被拆節點、沒有被改寫。
    const hydrated = docFromJSON(editor.getJSON());
    const hydratedBlock = hydrated.child(0).child(0);
    expect(hydratedBlock.childCount).toBe(1);
    expect(hydratedBlock.firstChild!.type.name).toBe("text");
    expect(hydratedBlock.textContent).toBe("走進門\n關上門");
  });
});

describe("Enter：延續當前區塊型別", () => {
  it("動作尾端 + Enter：切出另一個動作", () => {
    build([{ type: "action", content: [{ type: "text", text: "走" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["action", "action"]);
  });

  it("動作中段 + Enter：就地切成兩個動作，文字各半", () => {
    build([{ type: "action", content: [{ type: "text", text: "走進門關上門" }] }]);
    // 游標放在「走進門」之後（區塊內容起點 pos 2，再 +3 個字）。
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(2 + 3))),
    );

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["action", "action"]);
    const scene = editor.state.doc.child(0);
    expect(scene.child(0).textContent).toBe("走進門");
    expect(scene.child(1).textContent).toBe("關上門");
  });

  it("插入畫面 + Enter：切出另一個插入畫面（不是預設的動作），不進多行模式", () => {
    build([{ type: "insertShot", content: [{ type: "text", text: "牆上的時鐘" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["insertShot", "insertShot"]);
  });

  it("空的插入畫面 + Enter：取消型別，變回描述（不是再生一個空的插入畫面）", () => {
    build([
      { type: "insertShot", content: [{ type: "text", text: "牆上的時鐘" }] },
      { type: "insertShot" },
    ]);
    caretAtEndOfBlock(1);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["insertShot", "action"]);
  });

  it("空的對白（人名也空）+ Enter：取消型別，變回描述", () => {
    build([
      { type: "action", content: [{ type: "text", text: "門開了" }] },
      { type: "dialogue" },
    ]);
    caretAtEndOfBlock(1);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["action", "action"]);
  });

  it("只填了人名、台詞還空的對白 + Enter：不取消（人名是已寫下的東西）", () => {
    build([
      {
        type: "dialogue",
        attrs: { character: { id: null, displayName: "小明" }, voiceStyle: "一般" },
      },
    ]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["dialogue", "dialogue"]);
  });

  it("對白 + Enter：切出另一段對白，說話者清空（新那段要重新指定人名）", () => {
    build([
      {
        type: "dialogue",
        attrs: { character: { id: null, displayName: "小明" }, voiceStyle: "一般" },
        content: [{ type: "text", text: "還有位子嗎？" }],
      },
    ]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Enter");

    expect(blockTypes()).toEqual(["dialogue", "dialogue"]);
    const [first, next] = [editor.state.doc.child(0).child(0), editor.state.doc.child(0).child(1)];
    expect(first.attrs.character).toEqual({ id: null, displayName: "小明" }); // 原本那段不動
    expect(next.attrs.character).toBeNull(); // 新那段：說話者清空
    expect(next.attrs.voiceStyle).toBe("一般"); // schema 預設
  });
});

/**
 * 票券 28：`\n` 在區塊**結尾**（＝按完 `Shift+Enter`、還沒開始打字的那一刻）。
 *
 * 真正會壞的不是 caret 而是**字元本身**：ProseMirror 從 DOM 讀回變動時，若區塊型別沒宣告
 * `whitespace: "pre"`，parser 會把 `\n` 換成一個半形空格（見 `schema.ts` 的 `sceneBlock`）。
 * 症狀是「打字後跳回第一行」，實際是換行被刪掉了。
 */
describe("Shift+Enter：`\\n` 在區塊結尾", () => {
  /** 第 `i` 個區塊內容的結束位置（＝該區塊文字末端）。 */
  function endOfBlock(i: number) {
    const scene = editor.state.doc.child(0);
    let pos = 2;
    for (let k = 0; k < i; k++) pos += scene.child(k).nodeSize;
    return pos + scene.child(i).content.size;
  }

  it("按完之後游標在 `\\n` 之後（區塊文字末端），不是之前", () => {
    build([{ type: "action", content: [{ type: "text", text: "走進門" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Shift-Enter");

    expect(editor.state.doc.child(0).child(0).textContent).toBe("走進門\n");
    expect(editor.state.selection.from).toBe(endOfBlock(0));
  });

  it("連按兩次：兩個空行，游標在最後", () => {
    build([{ type: "action", content: [{ type: "text", text: "走進門" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Shift-Enter");
    editor.commands.keyboardShortcut("Shift-Enter");

    expect(editor.state.doc.child(0).child(0).textContent).toBe("走進門\n\n");
    expect(editor.state.selection.from).toBe(endOfBlock(0));
  });

  it("尾端 `\\n` 原封不動進入 canonical document", () => {
    build([{ type: "action", content: [{ type: "text", text: "走進門" }] }]);
    caretAtEndOfBlock(0);

    editor.commands.keyboardShortcut("Shift-Enter");

    const hydrated = docFromJSON(toPlainJson(editor.getJSON()));
    const block = hydrated.child(0).child(0);
    expect(block.childCount).toBe(1);
    expect(block.firstChild!.type.name).toBe("text");
    expect(block.textContent).toBe("走進門\n");
  });
});

/**
 * 票券 28 的迴歸樁 —— 直接釘住那個把 `\n` 吃掉的縫。
 *
 * `readDOMChange` → `parseBetween` 用的就是這支 parser；打字當下它會把游標所在區塊的 DOM
 * 重新 parse 一次，`whitespace` 沒宣告成 `"pre"` 的話 `\n` 就在這裡變成半形空格。拿掉
 * `schema.ts` 的那一行，這三條會紅。
 */
describe("DOM parse：區塊內的空白是內容，不被正規化", () => {
  function parseBlock(dataType: string, text: string) {
    build([{ type: "action" }]);
    const dom = document.createElement("div");
    dom.innerHTML = `<section data-type="scene"><p data-type="${dataType}">${text}</p></section>`;
    const parsed = DOMParser.fromSchema(editor.schema).parse(dom);
    return parsed.child(0).child(0).textContent;
  }

  it("動作：`\\n` 夾在中間不變成空格", () => {
    expect(parseBlock("action", "走進門\n關上門")).toBe("走進門\n關上門");
  });

  it("動作：`\\n` 在結尾也留著（軟換行後還沒打字的那個狀態）", () => {
    expect(parseBlock("action", "走進門\n")).toBe("走進門\n");
  });

  it("對白與插入畫面同樣保留（三種區塊同一條規則）", () => {
    expect(parseBlock("dialogue", "還有位子嗎？\n只剩吧台。")).toBe("還有位子嗎？\n只剩吧台。");
    expect(parseBlock("insert-shot", "牆上的時鐘\n指著三點。")).toBe("牆上的時鐘\n指著三點。");
  });
});
