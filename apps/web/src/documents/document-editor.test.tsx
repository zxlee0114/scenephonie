// @vitest-environment jsdom
/**
 * 票券 21 —— 劇本外文件的編輯器：簡單的富文本、字數計數器、改名。
 *
 * jsdom 沒有版面引擎，打字走 Tiptap 的 command（`dom.editor` 是 Tiptap 掛在編輯區上的那一個實體）——
 * 測的是「doc 變了，畫面上的字數跟著變」，不是鍵盤事件怎麼變成字。
 */
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { documentFromJSON, emptyDocument } from "@scenephonie/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SaveToken } from "@/persistence";

import { DocumentEditor } from "./document-editor";

const token = "st_0" as SaveToken;
const save = vi.fn(async () => ({ status: "saved" as const, token }));

const prose = (...paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

/** Tiptap 掛在編輯區 DOM 上的 editor。 */
async function editorIn(container: HTMLElement): Promise<Editor> {
  let editor: Editor | undefined;
  await waitFor(() => {
    editor = (container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null)?.editor;
    expect(editor).toBeDefined();
  });
  return editor!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("字數計數器", () => {
  it("打開時就數好既有的字", async () => {
    render(<DocumentEditor kind="交件大綱" initialBody={prose("一個雨夜，", "小明出門。")} initialToken={token} save={save} />);
    await waitFor(() => expect(screen.getByText(/10\s*字/)).toBeTruthy());
  });

  it("打字之後跟著變", async () => {
    const { container } = render(
      <DocumentEditor kind="交件大綱" initialBody={emptyDocument()} initialToken={token} save={save} />,
    );
    const editor = await editorIn(container);
    await waitFor(() => expect(screen.getByText(/0\s*字/)).toBeTruthy());

    act(() => {
      editor.commands.insertContent("小明在雨中奔跑");
    });
    await waitFor(() => expect(screen.getByText(/7\s*字/)).toBeTruthy());
  });

  it("只計數，不擋字：超過任何一個獎的上限也照樣打得進去、沒有警告", async () => {
    const long = "字".repeat(1600);
    const { container } = render(<DocumentEditor kind="交件大綱" initialBody={prose(long)} initialToken={token} save={save} />);
    await waitFor(() => expect(screen.getByText(/1,600\s*字/)).toBeTruthy());
    expect(container.querySelector("[role=alert]")).toBeNull();
  });
});

describe("三種文字文件都有計數器，畫面上用編劇熟的名字", () => {
  it("交件大綱在畫面上叫「故事大綱」", async () => {
    render(<DocumentEditor kind="交件大綱" initialBody={prose("雨")} initialToken={token} save={save} />);
    expect(screen.getByRole("heading", { name: "故事大綱" })).toBeTruthy();
  });

  it("分場大綱也有計數器", async () => {
    render(<DocumentEditor kind="分場大綱" initialBody={prose("場景一")} initialToken={token} save={save} />);
    await waitFor(() => expect(screen.getByText(/3\s*字/)).toBeTruthy());
  });
});

describe("簡單的富文本", () => {
  it("標題、清單、引用、分隔線、粗斜體打出來的東西，寫入邊界讀得懂", async () => {
    const { container } = render(
      <DocumentEditor kind="自由文件" initialBody={emptyDocument()} initialToken={token} save={save} />,
    );
    const editor = await editorIn(container);

    // 貼上一段 HTML 走的是編輯器自己的 parse —— 每一種格式長成哪個節點、帶哪些屬性，都是 Tiptap 決定的。
    act(() => {
      editor.commands.setContent(
        "<h2>第一幕</h2><h3>雨夜</h3><ul><li><p>出門</p></li></ul><ol><li><p>回家</p></li></ol>" +
          "<blockquote><p>台詞</p></blockquote><hr><p><strong><em>重點</em></strong></p>",
        { emitUpdate: true },
      );
    });

    const json = editor.getJSON();
    const types = (json.content ?? []).map((node) => node.type);
    expect(types).toEqual(
      expect.arrayContaining(["heading", "bulletList", "orderedList", "blockquote", "horizontalRule", "paragraph"]),
    );
    const marks = json.content?.at(-1)?.content?.[0]?.marks?.map((mark) => mark.type);
    expect(marks).toEqual(expect.arrayContaining(["bold", "italic"]));
    expect(() => documentFromJSON("自由文件", json)).not.toThrow();
  });

  it("沒有第一層標題（留給文件名稱）", async () => {
    const { container } = render(
      <DocumentEditor kind="自由文件" initialBody={prose("大標")} initialToken={token} save={save} />,
    );
    const editor = await editorIn(container);
    act(() => {
      editor.commands.setHeading({ level: 1 as 2 });
    });
    expect(editor.getJSON().content?.[0]?.type).toBe("paragraph");
  });
});

describe("Markdown 捷徑", () => {
  /** 模擬打字：讓 input rule 有機會看到每一個字（`insertContent` 不走 input rule）。 */
  const type = (editor: Editor, text: string) => {
    for (const char of text) {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)));
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    }
  };

  it("一般段落裡打「## 」變成標題", async () => {
    const { container } = render(<DocumentEditor kind="自由文件" initialBody={emptyDocument()} initialToken={token} save={save} />);
    const editor = await editorIn(container);
    act(() => {
      editor.commands.focus("start");
      type(editor, "## ");
    });
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
  });

  it("標題裡打「## 」就是那幾個字，不會被吃掉", async () => {
    const heading = { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] };
    const { container } = render(<DocumentEditor kind="自由文件" initialBody={heading} initialToken={token} save={save} />);
    const editor = await editorIn(container);
    act(() => {
      editor.commands.focus("start");
      type(editor, "## 開頭");
    });
    expect(editor.state.doc.textContent).toBe("## 開頭");
  });
});

describe("格式選單", () => {
  it("選了字之後的選單按得出粗體", async () => {
    const { container } = render(<DocumentEditor kind="自由文件" initialBody={prose("重點")} initialToken={token} save={save} />);
    const editor = await editorIn(container);
    act(() => {
      editor.chain().focus().setTextSelection({ from: 1, to: 3 }).run();
    });
    fireEvent.click(await screen.findByRole("button", { name: "粗體（⌘B）", hidden: true }));
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.map((mark) => mark.type)).toEqual(["bold"]);
  });

  it("選單上就是這份文件能做的全部（底線、連結不在裡面）", async () => {
    const { container } = render(<DocumentEditor kind="自由文件" initialBody={prose("重點")} initialToken={token} save={save} />);
    const editor = await editorIn(container);
    act(() => {
      editor.chain().focus().setTextSelection({ from: 1, to: 3 }).run();
    });
    const menu = await screen.findByRole("toolbar", { name: "格式", hidden: true });
    expect(Array.from(menu.querySelectorAll("button"), (button) => button.textContent)).toEqual([
      "內文",
      "標題",
      "小標題",
      "B",
      "I",
      "• 項目",
      "1. 編號",
      "引用",
    ]);
  });
});

describe("改名", () => {
  const renderNamed = (rename: (title: string) => Promise<boolean>) =>
    render(
      <DocumentEditor
        kind="自由文件"
        initialBody={emptyDocument()}
        initialToken={token}
        save={save}
        title={{ initial: "世界觀", rename }}
      />,
    );

  it("離開名字欄時送出新名字", async () => {
    const rename = vi.fn(async () => true);
    renderNamed(rename);
    const input = screen.getByLabelText("文件名稱") as HTMLInputElement;
    expect(input.value).toBe("世界觀");

    fireEvent.change(input, { target: { value: "研究筆記" } });
    fireEvent.blur(input);
    await waitFor(() => expect(rename).toHaveBeenCalledWith("研究筆記"));
  });

  it("按 Enter 也算定案", async () => {
    const rename = vi.fn(async () => true);
    renderNamed(rename);
    const input = screen.getByLabelText("文件名稱");

    fireEvent.change(input, { target: { value: "高雄拍 500 字版" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(rename).toHaveBeenCalledWith("高雄拍 500 字版"));
  });

  it("剛新增的那一份，一進來焦點就在名字欄", () => {
    render(
      <DocumentEditor
        kind="自由文件"
        initialBody={emptyDocument()}
        initialToken={token}
        save={save}
        title={{ initial: null, rename: vi.fn(async () => true), focus: true }}
      />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("文件名稱"));
  });

  it("固定文件沒有名字欄：名字就是它是什麼", () => {
    render(<DocumentEditor kind="分場大綱" initialBody={emptyDocument()} initialToken={token} save={save} />);
    expect(screen.queryByLabelText("文件名稱")).toBeNull();
  });

  it("名字沒變就不送", async () => {
    const rename = vi.fn(async () => true);
    renderNamed(rename);
    fireEvent.blur(screen.getByLabelText("文件名稱"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rename).not.toHaveBeenCalled();
  });

  it("沒有名字時，欄位裡淡淡地寫著「未命名文件」", async () => {
    render(
      <DocumentEditor
        kind="自由文件"
        initialBody={emptyDocument()}
        initialToken={token}
        save={save}
        title={{ initial: null, rename: vi.fn(async () => true) }}
      />,
    );
    expect((screen.getByLabelText("文件名稱") as HTMLInputElement).placeholder).toBe("未命名文件");
  });
});
