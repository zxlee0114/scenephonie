/**
 * hub 卡片的內文預覽（票券 21）。
 */
import { describe, expect, it } from "vitest";

import { plainTextExcerpt } from "./excerpt";

const paragraphs = (...texts: string[]) => ({
  type: "doc",
  content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

describe("plainTextExcerpt", () => {
  it("段落之間空一格，不黏在一起", () => {
    expect(plainTextExcerpt(paragraphs("一個雨夜", "小明出門"), 50)).toBe("一個雨夜 小明出門");
  });

  it("超過長度就截斷、補刪節號", () => {
    expect(plainTextExcerpt(paragraphs("一二三四五六"), 4)).toBe("一二三四…");
  });

  it("空文件是空字串（卡片改放圖示）", () => {
    expect(plainTextExcerpt({ type: "doc", content: [{ type: "paragraph" }] }, 50)).toBe("");
  });

  it("巢狀的清單與粗體照樣讀得到字", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "第一幕" }] },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "重點", marks: [{ type: "bold" }] }] }] }],
        },
      ],
    };
    expect(plainTextExcerpt(doc, 50)).toBe("第一幕 重點");
  });

  it("attrs 裡的東西不是字（場次的地點、人物是 id）", () => {
    const screenplay = {
      type: "doc",
      content: [{ type: "scene", attrs: { sceneId: "sc_1", locationId: "lo_1" }, content: [{ type: "action", content: [{ type: "text", text: "雨停了。" }] }] }],
    };
    expect(plainTextExcerpt(screenplay, 50)).toBe("雨停了。");
  });

  it("壞掉的 JSON 不丟例外，只是沒有預覽", () => {
    expect(plainTextExcerpt(null, 50)).toBe("");
    expect(plainTextExcerpt("doc", 50)).toBe("");
  });
});
