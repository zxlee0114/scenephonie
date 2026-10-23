/**
 * 交件文件（票券 21，§6.2、ADR-0009）：kind 與層級、各 kind 的 node schema、字數計數器。
 */
import { describe, expect, it } from "vitest";

import { countCharacters, documentFromJSON, documentLevel, documentSchema, isDocumentKind } from "./documents";

/** 一份交件大綱，每個字串是一段。 */
const outline = (...paragraphs: string[]) =>
  documentFromJSON("交件大綱", {
    type: "doc",
    content: paragraphs.map((text) => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" })),
  });

describe("countCharacters：字數照 Word 的「字數」算", () => {
  it("中文一個字算一個", () => {
    expect(countCharacters(outline("小明在雨中奔跑"))).toBe(7);
  });

  it("全形標點算字（簡章的字數含標點）", () => {
    expect(countCharacters(outline("他說：「走吧。」"))).toBe(8);
  });

  it("空白與換段不算字", () => {
    expect(countCharacters(outline("小明　奔跑", "", "  雨停了 "))).toBe(7);
  });

  it("連續的英數算一個字（一個英文單字、一個數字）", () => {
    expect(countCharacters(outline("Taipei 101 的夜景"))).toBe(5);
  });

  it("英文單字黏著的半形標點不另算", () => {
    expect(countCharacters(outline("Hello, world."))).toBe(2);
  });

  it("中英相鄰時各自計數", () => {
    expect(countCharacters(outline("他用iPhone拍照"))).toBe(5);
  });

  it("兩段的英文單字不會被接成一個", () => {
    expect(countCharacters(outline("end", "start"))).toBe(2);
  });

  it("空文件是零", () => {
    expect(countCharacters(outline(""))).toBe(0);
  });
});

describe("不變式 F：kind 固定其合法層級", () => {
  it("交件大綱描述整部作品 → 掛專案", () => {
    expect(documentLevel("交件大綱")).toBe("project");
  });

  it("分場大綱描述那一份劇本 → 掛劇本", () => {
    expect(documentLevel("分場大綱")).toBe("screenplay");
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

  it("粗體之類的呈現資訊進不來（約束 2）", () => {
    expect(() =>
      documentFromJSON("交件大綱", {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "重點", marks: [{ type: "bold" }] }] }],
      }),
    ).toThrow();
  });

  it("每個 kind 有自己的 schema（改一個不會牽動另一個）", () => {
    expect(documentSchema("交件大綱")).not.toBe(documentSchema("分場大綱"));
  });
});
