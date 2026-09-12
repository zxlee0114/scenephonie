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
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
    cleanup();
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


/**
 * 第二個地點**不覆蓋第一個**（使用者裁決 2026-09-10）。
 *
 * 舊行為是靜悄悄的覆蓋：單值欄的 `merge` 只留最後一筆。但打第二個地點的編劇多半不是要換掉
 * 第一個，而是這一場真的橫跨兩地 —— 那是場次形狀的問題，不該由一次覆蓋替他決定。
 */
describe("非雜景場次的第二個地點", () => {
  afterEach(() => {
    cleanup();
  });

  /** 先填好第一個地點，回傳地點欄的 input。 */
  async function withFirstLocation(container: HTMLElement) {
    const input = await typeInto(container, ".scene__chip--location", "派出所");
    await waitFor(() => expect(locationChips(container)).toEqual(["派出所"]));
    return input;
  }

  /** 打第二個地點並按 Enter，等面板出現。 */
  async function offerSecond(container: HTMLElement, input: HTMLInputElement) {
    fireEvent.change(input, { target: { value: "警局" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(container.querySelector(".entity-field__confirm")).not.toBeNull());
  }

  it("按 Enter 不建實體、不覆蓋 —— 字留在框裡反白，面板問要留哪一個", async () => {
    const { container } = render(<Harness intExt="內景" />);
    const input = await withFirstLocation(container);
    await offerSecond(container, input);

    // 第一個地點原封不動，第二個還只是框裡的字。
    expect(locationChips(container)).toEqual(["派出所"]);
    expect(input.value).toBe("警局");
    // 整串反白 —— 一個 Backspace 就清得掉。
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, "警局".length]);
  });

  it("挑「改成…」才真的取代", async () => {
    const { container } = render(<Harness intExt="內景" />);
    const input = await withFirstLocation(container);
    await offerSecond(container, input);

    fireEvent.keyDown(input, { key: "Enter" }); // 面板第一列 ＝ 改成「警局」
    await waitFor(() => expect(locationChips(container)).toEqual(["警局"]));
  });

  it("挑「兩個都留」把這一場改成雜景，兩個地點都在", async () => {
    let editor!: Editor;
    const { container } = render(<Harness intExt="內景" onEditor={(e) => (editor = e)} />);
    const input = await withFirstLocation(container);
    await offerSecond(container, input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" }); // 第二列 ＝ 兩個都留

    await waitFor(() => expect(locationChips(container)).toEqual(["派出所", "警局"]));
    expect(editor.state.doc.firstChild?.attrs.intExt).toBe("雜景");
  });

  it("再打一個字就不是在回答面板了 —— 面板收起來", async () => {
    const { container } = render(<Harness intExt="內景" />);
    const input = await withFirstLocation(container);
    await offerSecond(container, input);

    fireEvent.change(input, { target: { value: "警局大" } });
    await waitFor(() => expect(container.querySelector(".entity-field__confirm")).toBeNull());
    expect(locationChips(container)).toEqual(["派出所"]);
  });
});

// 使用者回饋 2026-09-10（第五輪）：「在多個地點的情況要更換雜景，是沒有提示的狀況下不給換，
// 我希望這種情形一樣跳出資訊框，來告知編劇情況」。
//
// kernel 一直都擋著（`setSceneIntExt`：離開雜景時多出來的地點沒地方去），但拒絕當下畫面上
// 只是「下拉沒有變」—— 沒有比「按了沒反應」更糟的回答。
describe("離開雜景時，多出來的地點要有人說一聲", () => {
  afterEach(() => {
    cleanup();
  });

  /** 雜景場次 ＋ 兩個地點，就是那個擋著的狀態。 */
  async function twoLocations() {
    let editor!: Editor;
    const { container } = render(<Harness intExt="雜景" onEditor={(e) => (editor = e)} />);
    await typeInto(container, ".scene__chip--location", "派出所、警局", 1);
    await waitFor(() => expect(locationChips(container)).toEqual(["派出所", "警局"]));
    return { container, editor: () => editor };
  }

  const intExtChip = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('.scene__chips [aria-label="內外"]')!;

  it("挑「內景」→ 浮出說明面板，doc 一個字都沒改", async () => {
    const { container, editor } = await twoLocations();

    const chip = intExtChip(container);
    chip.focus();
    fireEvent.keyDown(chip, { key: "i" }); // 速記鍵：內景

    const note = await waitFor(() => {
      const el = container.querySelector(".chip-select__note");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(note.textContent).toContain("2 個地點");
    expect(note.textContent).toContain("派出所、警局");
    expect(editor().state.doc.child(0).attrs.intExt).toBe("雜景"); // 沒有偷偷寫進去
    expect(locationChips(container)).toEqual(["派出所", "警局"]); // 也沒有偷偷刪地點
  });

  it("面板不提供「幫你刪掉多餘的地點」—— 只有「去地點欄」與「維持雜景」", async () => {
    const { container } = await twoLocations();

    const chip = intExtChip(container);
    chip.focus();
    fireEvent.keyDown(chip, { key: "i" });

    const rows = await waitFor(() => {
      const found = [...container.querySelectorAll(".chip-select__rows li")];
      expect(found).toHaveLength(2);
      return found;
    });
    expect(rows.map((r) => r.textContent)).toEqual(["→ 先去地點欄拿掉多餘的", "✕ 維持雜景"]);
  });

  it("挑「先去地點欄」→ 焦點落在地點欄，面板收起來", async () => {
    const { container } = await twoLocations();

    const chip = intExtChip(container);
    chip.focus();
    fireEvent.keyDown(chip, { key: "i" });
    await waitFor(() => expect(container.querySelector(".chip-select__note")).not.toBeNull());

    fireEvent.keyDown(chip, { key: "Enter" }); // 第 0 列
    const locationInput = container.querySelector<HTMLInputElement>(
      ".scene__chip--location input",
    )!;
    await waitFor(() => expect(document.activeElement).toBe(locationInput));
    expect(container.querySelector(".chip-select__note")).toBeNull();
  });

  it("Esc 收起面板，內外維持雜景", async () => {
    const { container, editor } = await twoLocations();

    const chip = intExtChip(container);
    chip.focus();
    fireEvent.keyDown(chip, { key: "i" });
    await waitFor(() => expect(container.querySelector(".chip-select__note")).not.toBeNull());

    fireEvent.keyDown(chip, { key: "Escape" });
    await waitFor(() => expect(container.querySelector(".chip-select__note")).toBeNull());
    expect(editor().state.doc.child(0).attrs.intExt).toBe("雜景");
  });

  it("地點減回一個之後就換得動了（面板不再出現）", async () => {
    const { container, editor } = await twoLocations();

    // 從地點欄把第二個 chip 移掉。
    const remove = [...container.querySelectorAll<HTMLButtonElement>(
      ".scene__chip--location .entity-chip__remove",
    )];
    fireEvent.mouseDown(remove[1]!);
    await waitFor(() => expect(locationChips(container)).toEqual(["派出所"]));

    const chip = intExtChip(container);
    chip.focus();
    fireEvent.keyDown(chip, { key: "i" });

    await waitFor(() => expect(editor().state.doc.child(0).attrs.intExt).toBe("內景"));
    expect(container.querySelector(".chip-select__note")).toBeNull();
  });
});
