/**
 * 劇本外文件（票券 21，§6.2、ADR-0009）：kind 與層級、各 kind 的 node schema、字數計數器。
 */
import { describe, expect, it } from "vitest";

import {
  wordCount,
  documentFromJSON,
  documentLevel,
  documentSchema,
  isDocumentKind,
  isFixedDocument,
} from "./documents";

/** 一份交件大綱，每個字串是一段。 */
const outline = (...paragraphs: string[]) =>
  documentFromJSON("交件大綱", {
    type: "doc",
    content: paragraphs.map((text) => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" })),
  });

describe("wordCount：字數照 Word 的「字數」算", () => {
  it("中文一個字算一個", () => {
    expect(wordCount(outline("小明在雨中奔跑"))).toBe(7);
  });

  it("全形標點算字（簡章的字數含標點）", () => {
    expect(wordCount(outline("他說：「走吧。」"))).toBe(8);
  });

  it("空白與換段不算字", () => {
    expect(wordCount(outline("小明　奔跑", "", "  雨停了 "))).toBe(7);
  });

  it("連續的英數算一個字（一個英文單字、一個數字）", () => {
    expect(wordCount(outline("Taipei 101 的夜景"))).toBe(5);
  });

  it("英文單字黏著的半形標點不另算", () => {
    expect(wordCount(outline("Hello, world."))).toBe(2);
  });

  it("中英相鄰時各自計數", () => {
    expect(wordCount(outline("他用iPhone拍照"))).toBe(5);
  });

  it("兩段的英文單字不會被接成一個", () => {
    expect(wordCount(outline("end", "start"))).toBe(2);
  });

  it("標題、清單、引用裡的字照樣算；格式本身不算字", () => {
    const doc = documentFromJSON("自由文件", {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "第一幕" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "雨夜" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "end" }] }] },
          ],
        },
        { type: "horizontalRule" },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "start" }] }] },
        { type: "paragraph", content: [{ type: "text", text: "重點", marks: [{ type: "bold" }] }] },
      ],
    });
    // 第一幕 3 ＋ 雨夜 2 ＋ end 1 ＋ start 1 ＋ 重點 2
    expect(wordCount(doc)).toBe(9);
  });

  it("空文件是零", () => {
    expect(wordCount(outline(""))).toBe(0);
  });
});

describe("不變式 F：kind 固定其合法層級", () => {
  it("交件大綱描述整部作品 → 掛專案", () => {
    expect(documentLevel("交件大綱")).toBe("project");
  });

  it("分場大綱描述那一份劇本 → 掛劇本", () => {
    expect(documentLevel("分場大綱")).toBe("screenplay");
  });

  it("自由文件掛專案（hub 上不分層，資料上還是要有一個位置）", () => {
    expect(documentLevel("自由文件")).toBe("project");
  });

  it("交件大綱與分場大綱是固定的那一份；自由文件可以有很多份", () => {
    expect(isFixedDocument("交件大綱")).toBe(true);
    expect(isFixedDocument("分場大綱")).toBe(true);
    expect(isFixedDocument("自由文件")).toBe(false);
  });

  it("認不得的 kind 不是 kind（從資料庫讀到的字串要先過這一關）", () => {
    expect(isDocumentKind("交件大綱")).toBe(true);
    expect(isDocumentKind("劇情大綱")).toBe(false);
    expect(isDocumentKind("toString")).toBe(false);
  });
});

describe("documentFromJSON：照該 kind 的 schema 驗證", () => {
  it("段落組成的文件讀得出來", () => {
    const doc = documentFromJSON("分場大綱", {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "場景一：中彈送醫" }] }],
    });
    expect(doc.textContent).toBe("場景一：中彈送醫");
  });

  it("劇本的節點進不來（場次不是散文文件的一部分）", () => {
    expect(() =>
      documentFromJSON("交件大綱", { type: "doc", content: [{ type: "scene", attrs: { sceneId: "sc_1" } }] }),
    ).toThrow();
  });

  it("一塊都沒有的文件不合法", () => {
    expect(() => documentFromJSON("交件大綱", { type: "doc", content: [] })).toThrow();
  });

  const paragraphWith = (marks: { type: string }[]) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "重點", marks }] }],
  });

  it("簡單的富文本讀得出來：標題、清單、引用、分隔線、粗體、斜體", () => {
    const doc = documentFromJSON("交件大綱", {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "第一幕" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "雨夜" }] },
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "出門" }] }] }],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "台詞" }] }] },
        { type: "horizontalRule" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "粗斜", marks: [{ type: "bold" }, { type: "italic" }] }],
        },
      ],
    });
    expect(doc.childCount).toBe(6);
  });

  it("第一層標題留給文件名稱，內文裡沒有", () => {
    expect(() =>
      documentFromJSON("自由文件", {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "大標" }] }],
      }),
    ).toThrow();
  });

  it("底線、連結這類不在清單上的標記進不來", () => {
    expect(() => documentFromJSON("交件大綱", paragraphWith([{ type: "underline" }]))).toThrow();
    expect(() => documentFromJSON("交件大綱", paragraphWith([{ type: "link" }]))).toThrow();
  });

  it("圖片進不來（GHSA 明文禁止，票 20 也不留逃生口）", () => {
    expect(() =>
      documentFromJSON("分場大綱", { type: "doc", content: [{ type: "image", attrs: { src: "x.png" } }] }),
    ).toThrow();
  });

  it("每個 kind 有自己的 schema（改一個不會牽動另一個）", () => {
    expect(documentSchema("交件大綱")).not.toBe(documentSchema("分場大綱"));
    expect(documentSchema("自由文件")).not.toBe(documentSchema("交件大綱"));
  });
});
