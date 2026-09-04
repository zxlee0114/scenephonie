// @vitest-environment jsdom
/**
 * 票券 04 驗收 #7 的回歸樁 —— 「開 Chrome DevTools 時按 Enter 換行 → renderer 卡死」。
 *
 * 成因：按 Enter 會 `splitBlock` 出新的 `action` 區塊、掛一個新的 node view。若那是 `@tiptap/react`
 * 的 node view，`ReactRenderer` 建構子會在 mount 當下同步 `flushSync(render)`（dist/index.js:613，
 * 無 opt-out）；這發生在 ProseMirror transaction 內部，開著 DevTools 時 `DOMObserver` 遞送時機被
 * 打亂，React 寫 DOM ↔ PM 讀回重繪互咬失控。修法：`action`／`insertShot` 是純結構外殼，改用原生
 * ProseMirror node view（`nodes/blocks.tsx` 的 `staticBlockView`），完全不進 React。
 *
 * jsdom 無法重現卡死本身（要 DevTools 擾動 DOMObserver 時機才會發散）；這裡鎖的是「移除觸發條件」
 * 的結構不變式：`action`／`insertShot` 掛的**不是** React node view，只有 `dialogue`（有人物欄
 * `CjkField` 與焦點串接）才是。誰把 `ActionNode` 換回 `ReactNodeViewRenderer` 就會在這裡爆。
 *
 * `@tiptap/react` 每個 node view 會包一層 `<div class="react-renderer node-<型別>">`（dist/index.js
 * mount()）——用這個指紋分辨某個節點是不是走 React。`.block--action` 本來就住在 SceneView 這個
 * React node view 底下，所以只能查「有沒有專屬 action 的那層殼」，不能查有沒有 react-renderer 祖先。
 */
import { render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenplayEditor } from "./ScreenplayEditor";

function docWithEveryBlock() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("action", null, [kernelSchema.text("走進門口。")]),
        kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
        kernelSchema.node("insertShot", null, [kernelSchema.text("牆上的時鐘")]),
      ]),
    ])
    .toJSON() as object;
}

describe("票券 04 #7：純結構區塊不掛 React node view", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("action：無專屬 React 殼，.block--action 直接住在 .scene__body 裡", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithEveryBlock()} />);
    await waitFor(() => expect(container.querySelector(".block--action")).not.toBeNull());

    expect(container.querySelector(".react-renderer.node-action")).toBeNull();

    const action = container.querySelector(".block--action")!;
    expect(action.closest(".scene__body")).not.toBeNull();
    // 內容洞就是 contentDOM 本身，不再多一層 React 的 [data-node-view-content-react]。
    const content = action.querySelector(".block__content")!;
    expect(content).not.toBeNull();
    expect(content.querySelector("[data-node-view-content-react]")).toBeNull();
  });

  it("insertShot：無專屬 React 殼，結構標籤在且不可編輯", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithEveryBlock()} />);
    await waitFor(() => expect(container.querySelector(".block--insert-shot")).not.toBeNull());

    expect(container.querySelector(".react-renderer.node-insertShot")).toBeNull();

    const shot = container.querySelector(".block--insert-shot")!;
    expect(shot.closest(".scene__body")).not.toBeNull();
    const tag = shot.querySelector(".block__tag")!;
    expect(tag).not.toBeNull();
    expect(tag.getAttribute("contenteditable")).toBe("false");
  });

  it("dialogue 仍是 React node view（有互動狀態的那個才進 React）", async () => {
    const { container } = render(<ScreenplayEditor initialContent={docWithEveryBlock()} />);
    await waitFor(() => expect(container.querySelector(".block--dialogue")).not.toBeNull());

    expect(container.querySelector(".react-renderer.node-dialogue")).not.toBeNull();
  });
});
