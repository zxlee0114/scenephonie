// @vitest-environment jsdom
/**
 * 票券 21 —— 劇本外文件的編輯器：散文、字數計數器、改名。
 *
 * jsdom 沒有版面引擎，打字走 Tiptap 的 command（`dom.editor` 是 Tiptap 掛在編輯區上的那一個實體）——
 * 測的是「doc 變了，畫面上的字數跟著變」，不是鍵盤事件怎麼變成字。
 */
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyDocument } from "@scenephonie/schema";
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

describe("交件大綱的字數計數器", () => {
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

describe("分場大綱", () => {
  it("是自由文字，沒有字數計數器（沒有任何人在管它的字數）", async () => {
    const { container } = render(
      <DocumentEditor kind="分場大綱" initialBody={prose("場景一")} initialToken={token} save={save} />,
    );
    await editorIn(container);
    expect(screen.queryByText(/\d\s*字/)).toBeNull();
  });
});

describe("改名", () => {
  const renderNamed = (rename: (title: string) => Promise<boolean>) =>
    render(
      <DocumentEditor
        kind="交件大綱"
        initialBody={emptyDocument()}
        initialToken={token}
        save={save}
        title={{ initial: "劇情大綱", rename }}
      />,
    );

  it("離開名字欄時送出新名字", async () => {
    const rename = vi.fn(async () => true);
    renderNamed(rename);
    const input = screen.getByLabelText("文件名稱") as HTMLInputElement;
    expect(input.value).toBe("劇情大綱");

    fireEvent.change(input, { target: { value: "故事大綱" } });
    fireEvent.blur(input);
    await waitFor(() => expect(rename).toHaveBeenCalledWith("故事大綱"));
  });

  it("按 Enter 也算定案", async () => {
    const rename = vi.fn(async () => true);
    renderNamed(rename);
    const input = screen.getByLabelText("文件名稱");

    fireEvent.change(input, { target: { value: "長綱" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(rename).toHaveBeenCalledWith("長綱"));
  });

  it("名字沒變就不送", async () => {
    const rename = vi.fn(async () => true);
    renderNamed(rename);
    fireEvent.blur(screen.getByLabelText("文件名稱"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rename).not.toHaveBeenCalled();
  });

  it("沒有名字時，欄位裡淡淡地寫著 kind", async () => {
    render(
      <DocumentEditor
        kind="交件大綱"
        initialBody={emptyDocument()}
        initialToken={token}
        save={save}
        title={{ initial: null, rename: vi.fn(async () => true) }}
      />,
    );
    expect((screen.getByLabelText("文件名稱") as HTMLInputElement).placeholder).toBe("交件大綱");
  });
});
