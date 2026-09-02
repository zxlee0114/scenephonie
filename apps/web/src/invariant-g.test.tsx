// @vitest-environment jsdom
/**
 * 不變式 G 的可否證清單（§7.9 / [ADR-0010](../../docs/adr/0010-editor-representation-is-not-output-preview.md)）。
 *
 * > 編輯器可以呈現 screenplay 的閱讀與創作語意，但**不得為模擬特定輸出格式而引入非必要的
 * > 版面約束或視覺結構**。
 *
 * kernel 的 `packages/schema/src/invariants.test.ts` 對「不變式 G」留了 `it.todo('票券 04')`——
 * 它是 isomorphic 套件，不能 import 編輯器。這個檔案是它的落點。
 */
import { render, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenplayEditor } from "./editor/ScreenplayEditor";

const HERE = dirname(fileURLToPath(import.meta.url.split("?")[0]!));
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

describe("不變式 G —— CSS 不模擬輸出格式", () => {
  const editorCss = read("./styles/editor.css");
  const tokensCss = read("./styles/tokens.css");

  it("沒有 A4 紙感／分頁線（無 210mm／794px／@page／page-break）", () => {
    for (const banned of ["210mm", "794px", "@page", "page-break"]) {
      expect(editorCss).not.toContain(banned);
      expect(tokensCss).not.toContain(banned);
    }
  });

  it("場次容器不畫邊框（.scene 規則只有 border: 0，無 box-shadow 框）", () => {
    const sceneRule = editorCss.match(/\.scene\s*\{[^}]*\}/)?.[0] ?? "";
    expect(sceneRule.match(/border:\s*[^;]+/)?.[0]).toBe("border: 0");
    expect(sceneRule).not.toContain("box-shadow");
  });

  it("行長用 ic（em fallback），不是固定像素欄寬", () => {
    expect(editorCss).toContain("1ic");
    expect(editorCss).toMatch(/max-inline-size:\s*\d+em/); // fallback 那一行
  });

  it("行高是無單位比值（字型換手不跳）", () => {
    expect(tokensCss).toMatch(/--leading-base:\s*[\d.]+;/);
    expect(tokensCss).not.toMatch(/--leading-base:\s*[\d.]+(px|rem|em);/);
  });

  it("楷體／明體不進螢幕編輯器的 --font-body", () => {
    const fontBody = tokensCss.match(/--font-body:[^;]+;/)?.[0] ?? "";
    // 楷體／明體（serifed CJK）不進；sans-serif 作為通用 fallback 是對的。
    for (const banned of ["Kai", "楷", "Ming", "明體", "Song", "宋", "STKaiti", "BiauKai", " serif"]) {
      expect(fontBody).not.toContain(banned);
    }
  });
});

describe("不變式：原始碼不得出現 hex（tokens.css 是唯一例外）", () => {
  it("src/ 下除 tokens.css 外，CSS／TSX 無 hex 色碼", () => {
    const globby = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...globby(full));
        else if (/\.(css|tsx)$/.test(entry)) out.push(full);
      }
      return out;
    };
    const srcDir = HERE;
    const offenders: string[] = [];
    for (const file of globby(srcDir)) {
      if (file.endsWith("tokens.css")) continue;
      const body = readFileSync(file, "utf8");
      const hits = body.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hits) offenders.push(`${file}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("不變式 G —— DOM：decoration 與 canonical content 的界線", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("場次號在 gutter：不進 content flow、不可 select、不可編輯、aria-hidden", async () => {
    const { container } = render(<ScreenplayEditor />);
    await waitFor(() => expect(container.querySelector(".scene")).not.toBeNull());

    const number = container.querySelector(".scene__number")!;
    expect(number).not.toBeNull();
    expect(number.getAttribute("aria-hidden")).toBe("true");
    // 不在 .scene__body（canonical content flow）裡
    expect(number.closest(".scene__body")).toBeNull();
    // 不可編輯（自己或祖先標了 contenteditable=false）
    expect(number.closest('[contenteditable="false"]')).not.toBeNull();
  });

  it("chip row 常駐且不可編輯（不是 canonical text insertion point）", async () => {
    const { container } = render(<ScreenplayEditor />);
    await waitFor(() => expect(container.querySelector(".scene__chips")).not.toBeNull());

    const chips = container.querySelector(".scene__chips")!;
    expect(chips.getAttribute("contenteditable")).toBe("false");
    expect(chips.closest(".scene__body")).toBeNull();
  });

  it("可編輯內容只在場次內（.ProseMirror 的直接可編輯子樹都在 .scene 底下）", async () => {
    const { container } = render(<ScreenplayEditor />);
    await waitFor(() => expect(container.querySelector(".scene__body")).not.toBeNull());

    const body = container.querySelector(".scene__body")!;
    expect(body.closest(".scene")).not.toBeNull();
    // 場次之間沒有游離的可編輯段落
    expect(container.querySelectorAll(".ProseMirror > p").length).toBe(0);
  });
});
