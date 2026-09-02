// @vitest-environment jsdom
/**
 * §7.1 —— 「欄位上的 Tab 要 stopPropagation」。人物欄裡按 Tab（**兩個方向**）都不能冒泡到
 * BlockCycle 把對白轉成別的型別 / 破壞欄位。chip row 已有此保護，人物欄同規則。
 */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenplayEditor } from "./ScreenplayEditor";

function docWithDialogue() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, [
        kernelSchema.node("dialogue", { character: null }, [kernelSchema.text("還有位子嗎？")]),
      ]),
    ])
    .toJSON() as object;
}

describe("人物欄的 Tab 不冒泡到 BlockCycle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
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
