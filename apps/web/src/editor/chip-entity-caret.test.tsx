// @vitest-environment jsdom
/**
 * 欄位**裡面**的方向鍵 —— chip 之間怎麼走（票券 34，使用者驗收回饋 2026-09-10 第三輪）。
 *
 * 「當地點、登場人物、群演有兩個或以上的實體時，左右鍵希望能在實體間導航，到最前面時才跳欄，
 * cmd + 左右鍵 能夠跳轉到欄位最前方或最後方」—— 使用者原話。
 *
 * 在這之前，定案成 chip 的那幾筆只有滑鼠進得去：←→ 在輸入框裡不是走字就是跳去隔壁那一格。
 * 規則與版面圖見 `./chip-caret`。這裡釘住的是它與**外層格線導航**（`nodes/scene`）的分工：
 * 欄位裡還有 chip 可走就歸欄位，走到最前面才輪到格線。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { mintExtraId, mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const scene = (attrs: Record<string, unknown>, blocks: unknown[]) =>
  kernelSchema.node("scene", { sceneId: mintSceneId(), ...attrs }, blocks as never);
const action = (text: string) => kernelSchema.node("action", null, [kernelSchema.text(text)]);
const docJSON = (...scenes: unknown[]) =>
  kernelSchema.node("doc", null, scenes as never).toJSON() as object;

function Harness({ doc, onEditor }: { doc: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

/** 三個人在登場人物欄、兩批群演在群演欄 —— 「兩個以上」才有得走。 */
const crowdedScene = () =>
  docJSON(
    scene(
      {
        appearingCharacters: [
          { characterId: "c1", displayName: "小明" },
          { characterId: "c2", displayName: "小華" },
          { characterId: "c3", displayName: "阿姨" },
        ],
        extras: [
          { extraId: mintExtraId(), description: "咖啡廳客人", count: 8 },
          { extraId: mintExtraId(), description: "服務生", count: 2 },
        ],
      },
      [action("門開了")],
    ),
  );

async function mount(doc: object) {
  let editor!: Editor;
  const { container } = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(container.querySelector(".scene__chip--extras input")).not.toBeNull());
  return { container, editor: () => editor };
}

const chipsIn = (root: HTMLElement, field: string) =>
  [...root.querySelectorAll<HTMLElement>(`.scene__chip--${field} .entity-chip`)];
const inputIn = (root: HTMLElement, field: string) =>
  root.querySelector<HTMLInputElement>(`.scene__chip--${field} input`)!;
/** 看得見的順序：chip 與輸入框在這一欄裡實際排成什麼樣（`|` ＝ 輸入框）。 */
const layoutOf = (root: HTMLElement, field: string) =>
  [...root.querySelectorAll(`.scene__chip--${field} .entity-chip, .scene__chip--${field} input`)].map(
    (el) => (el.tagName === "INPUT" ? "|" : (el.textContent?.replace(/[×＋📍👤👥]/gu, "").trim() ?? "")),
  );
const cell = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLElement>(`.scene__chips [aria-label="${label}"]`)!;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("登場人物欄：←→ 在實體之間走", () => {
  it("空輸入框按 ← → 退進**最後一個** chip", async () => {
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "character");
    expect(chips).toHaveLength(3);

    const input = inputIn(container, "character");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });

    await waitFor(() => expect(document.activeElement).toBe(chips[2]));
  });

  it("一路 ← 是 chip 與縫交替，走完最前面那道縫才離開這一格（去地點欄）", async () => {
    // `A B C |` 一路往左：C、B｜C 之間、B、A｜B 之間、A、A 左邊、出這一格（票券 39 收票）。
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "character");

    const input = inputIn(container, "character");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(chips[2]);

    fireEvent.keyDown(chips[2]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input); // 游標插進 B｜C 之間
    expect(layoutOf(container, "character")).toEqual(["小明", "小華", "|", "阿姨"]);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(chips[1]);

    fireEvent.keyDown(chips[1]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input); // A｜B 之間
    expect(layoutOf(container, "character")).toEqual(["小明", "|", "小華", "阿姨"]);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(chips[0]);

    // 第一顆左邊也有一道縫（新的一筆插得到那裡）—— 那是這一格的最後一站。
    fireEvent.keyDown(chips[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input);
    expect(layoutOf(container, "character")).toEqual(["|", "小明", "小華", "阿姨"]);

    // 再往左就出這一格了 —— 換 chip row 的格線接手。
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cell(container, "地點")));
  });

  it("→ 反向走回來，一樣是 chip 與縫交替", async () => {
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "character");
    const input = inputIn(container, "character");

    chips[0]!.focus();
    fireEvent.keyDown(chips[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input); // A｜B 之間
    expect(layoutOf(container, "character")).toEqual(["小明", "|", "小華", "阿姨"]);

    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(document.activeElement).toBe(chips[1]);

    fireEvent.keyDown(chips[1]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input); // B｜C 之間
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(document.activeElement).toBe(chips[2]);

    fireEvent.keyDown(chips[2]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input); // 回到隊尾
    expect(layoutOf(container, "character")).toEqual(["小明", "小華", "阿姨", "|"]);
    expect(input.selectionStart).toBe(0); // 字接在 chip 後面，游標就落在那裡
  });

  it("⌘← 到這一格的最前面，⌘→ 到最後面（輸入框字尾）", async () => {
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "character");
    const input = inputIn(container, "character");

    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft", metaKey: true });
    expect(document.activeElement).toBe(chips[0]);

    fireEvent.keyDown(chips[0]!, { key: "ArrowRight", metaKey: true });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(input.value.length);
  });

  it("chip 上的 ↑↓ 仍然是 chip row 的格線導航", async () => {
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "character");

    chips[1]!.focus();
    fireEvent.keyDown(chips[1]!, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).toBe(cell(container, "地點")));

    chips[1]!.focus();
    fireEvent.keyDown(chips[1]!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(inputIn(container, "extras")));
  });

  it("chip 不進 Tab 序 —— 環一個字都沒改（§7.3）", async () => {
    const { container } = await mount(crowdedScene());
    for (const chip of chipsIn(container, "character")) expect(chip.tabIndex).toBe(-1);
  });

  // 打到一半的字讓這條路暫時關著：離開輸入框會 blur，而 blur 會把那個字定案成一個**新的**
  // chip —— 剛算好的「最後一個」在那一刻就指向別人了。所以有字的時候 ← 照舊是「貼著字首就
  // 跳去隔壁那一格」（票券 34 第二輪的規則，沒有改），字定案之後才輪到 chip 那條路。
  it("輸入框裡還有沒定案的字時，← 不退進 chip —— 照舊跳去隔壁那一格", async () => {
    const { container } = await mount(crowdedScene());
    const input = inputIn(container, "character");
    input.focus();
    fireEvent.change(input, { target: { value: "阿" } });
    input.setSelectionRange(0, 0);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cell(container, "地點")));
  });

  it("chip 上的 Backspace ＝ 把它拿下來重編輯（同空欄位上的 Backspace）", async () => {
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "character");
    const input = inputIn(container, "character");

    chips[1]!.focus();
    fireEvent.keyDown(chips[1]!, { key: "Backspace" });

    // 字回到輸入框、焦點跟著回去 —— 與滑鼠點那個 chip 是同一條路（`editRef`）。
    await waitFor(() => expect(input.value).toBe("小華"));
    expect(document.activeElement).toBe(input);
  });
});

describe("群演欄：同一套規則", () => {
  it("空輸入框 ← 退進最後一批群演，chip 與縫交替，走完最前面才回登場人物欄", async () => {
    // 群演欄也吃同一套（票券 39 收票）—— 縫也是一站，新的一批插得進去。
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "extras");
    expect(chips).toHaveLength(2);
    const input = inputIn(container, "extras");

    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(chips[1]);

    fireEvent.keyDown(chips[1]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input); // 兩批之間那道縫
    expect(layoutOf(container, "extras")).toEqual(["咖啡廳客人（8）", "|", "服務生（2）"]);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(chips[0]);

    fireEvent.keyDown(chips[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input); // 第一批左邊那道縫
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cell(container, "登場人物")));
  });

  it("chip 上的 Backspace 把那一批拿下來重編輯（描述與人數一起回到輸入框）", async () => {
    const { container } = await mount(crowdedScene());
    const chips = chipsIn(container, "extras");
    const input = inputIn(container, "extras");

    chips[0]!.focus();
    fireEvent.keyDown(chips[0]!, { key: "Backspace" });

    await waitFor(() => expect(input.value).toBe("咖啡廳客人（8）"));
    // 真的從欄位裡拿下來了 —— 剩下一批。
    await waitFor(() => expect(chipsIn(container, "extras")).toHaveLength(1));
  });

  it("chip 上的 ↓ 仍然是「離開 chip row 進本場內文」", async () => {
    const { container, editor } = await mount(crowdedScene());
    const chips = chipsIn(container, "extras");
    editor().commands.setTextSelection(1);

    chips[0]!.focus();
    fireEvent.keyDown(chips[0]!, { key: "ArrowDown" });

    await waitFor(() => expect(editor().state.selection.$from.parent.textContent).toBe("門開了"));
  });
});

describe("一格空著時，←→ 照舊直接跳格", () => {
  it("沒有 chip 的登場人物欄：← 直接到地點欄", async () => {
    const { container } = await mount(docJSON(scene({}, [action("門開了")])));
    const input = inputIn(container, "character");
    expect(chipsIn(container, "character")).toHaveLength(0);

    input.focus();
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cell(container, "地點")));
  });
});
