// @vitest-environment jsdom
/**
 * 地點欄能收幾個值 —— **多值是雜景的性質，不是地點欄的性質**（§4.3，使用者裁決 2026-09-10）。
 *
 * 票券 08 原本讓地點欄一律吃頓號，靠 `setSceneLocations` 在非雜景場次拒絕第二個。那個順序
 * 是反的：編劇打進去的字先被切成 chip，再被 command 悄悄退回去。現在欄位**一開始就沒有收下**
 * 第二個值 —— 非雜景場次的頓號是名字裡的普通字元，跟對白人物欄同一條規則。
 *
 * （command 那一層的拒絕仍然在，而且必須在：UI 擋得住滑鼠，擋不住伺服器端呼叫。見
 * `packages/schema/src/commands/entity-refs.test.ts`。）
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema, type SceneIntExt } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithScene(intExt: SceneIntExt) {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId(), intExt }, [
        kernelSchema.node("action", null, [kernelSchema.text("內文")]),
      ]),
    ])
    .toJSON() as object;
}

function Harness({ intExt, onEditor }: { intExt: SceneIntExt; onEditor?: (e: Editor) => void }) {
  const editor = useScreenplayEditor(docWithScene(intExt));
  useEffect(() => {
    if (editor) onEditor?.(editor);
  }, [editor, onEditor]);
  return (
    // 沒有 projectId ＝ 本地鑄造（見 entity-catalog.tsx 檔頭）：id 照樣是 `lo_`，只是沒落地。
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

/** 這一場地點欄現在有幾個 chip，各是什麼字（× 的字不算）。 */
function locationChips(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".scene__chip--location .entity-chip")].map((chip) => {
    const clone = chip.cloneNode(true) as HTMLElement;
    clone.querySelector(".entity-chip__remove")?.remove();
    clone.querySelector(".entity-chip__mark")?.remove();
    return clone.textContent?.trim() ?? "";
  });
}

/**
 * 在某一欄打一串字然後按 Enter 定案。
 *
 * `splitsInto` ＝ 打字當下就會被頓號切出去的 chip 數。**要等它們真的寫回 doc 才按 Enter**：
 * 切出來的每一個都要先建實體（async），而 Enter 定案的那一筆是拿當下的 `refs` prop 去併的
 * —— 不等就會用一份還沒收到前一筆的清單覆蓋回去。真人打字中間隔著幾十毫秒，測試沒有。
 */
async function typeInto(container: HTMLElement, selector: string, value: string, splitsInto = 0) {
  const input = await waitFor(() => {
    const el = container.querySelector<HTMLInputElement>(`${selector} input`);
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.change(input, { target: { value } });
  if (splitsInto > 0) {
    await waitFor(() =>
      expect(container.querySelectorAll(`${selector} .entity-chip`).length).toBe(splitsInto),
    );
  }
  fireEvent.keyDown(input, { key: "Enter" });
  return input;
}

describe("地點欄能收幾個值", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("非雜景場次：頓號是名字裡的字，打「派出所、警局」得到一個地點", async () => {
    const { container } = render(<Harness intExt="內景" />);
    await typeInto(container, ".scene__chip--location", "派出所、警局");

    await waitFor(() => expect(locationChips(container)).toEqual(["派出所、警局"]));
  });

  it("雜景場次：同樣的字切成兩個地點", async () => {
    const { container } = render(<Harness intExt="雜景" />);
    await typeInto(container, ".scene__chip--location", "派出所、警局", 1);

    await waitFor(() => expect(locationChips(container)).toEqual(["派出所", "警局"]));
  });

  it("登場人物欄不受內外影響 —— 它本來就是多值", async () => {
    const { container } = render(<Harness intExt="內景" />);
    await typeInto(container, ".scene__chip--character", "小明、小華", 1);

    await waitFor(() =>
      expect(
        [...container.querySelectorAll(".scene__chip--character .entity-chip")].length,
      ).toBe(2),
    );
  });
});
