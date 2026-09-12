// @vitest-environment jsdom
/**
 * 實體改名的整條路（票券 39）—— 從 chip 上那一列按下去，到別場的顯示名真的換掉。
 *
 * `entity-field.test.tsx` 釘的是選單長什麼樣、按下去呼叫了誰；這裡釘的是**接線**：
 * 目錄那一筆走 `catalog.rename`，別場的稱呼走 `retitleEntityRefs` 寫回 doc。兩半分屬
 * 兩個不同的權威（實體表 vs doc），只有在這一層才看得到它們一起動。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintSceneId,
  sceneAppearingCharacters,
  schema as kernelSchema,
  sceneLocations,
} from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const DOLPHIN = "lo_dolphin";
const XIAOMING = "ch_xiaoming";

const scene = (displayName: string) =>
  kernelSchema.node(
    "scene",
    { sceneId: mintSceneId(), location: { locationId: DOLPHIN, displayName } },
    [kernelSchema.node("action", null, [kernelSchema.text("門開了")])],
  );

/** 兩場印著實體名、一場取過別名 —— 改名該不該波及，這三場剛好把分界畫出來。 */
const threeScenes = () =>
  kernelSchema
    .node("doc", null, [scene("海豚公寓房間"), scene("海豚公寓房間"), scene("未知大樓房間")])
    .toJSON() as object;

/** 同一場裡，登場人物欄與對白都印著同一個人 —— 改名的「這一場」不是原子單位。 */
const sceneWithSpeaker = () =>
  kernelSchema
    .node("doc", null, [
      kernelSchema.node(
        "scene",
        {
          sceneId: mintSceneId(),
          appearingCharacters: [{ characterId: XIAOMING, displayName: "小明" }],
        },
        [
          kernelSchema.node("dialogue", { character: { id: XIAOMING, displayName: "小明" } }, [
            kernelSchema.text("我回來了"),
          ]),
        ],
      ),
    ])
    .toJSON() as object;

function Harness({ doc, onEditor }: { doc: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider
      initial={{
        characters: [{ id: XIAOMING, name: "小明" }],
        locations: [{ id: DOLPHIN, name: "海豚公寓房間" }],
      }}
    >
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

async function mount(doc: object = threeScenes(), ready = ".scene__chip--location") {
  let editor!: Editor;
  const { container } = render(<Harness doc={doc} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(container.querySelector(ready)).not.toBeNull());
  return { container, editor: () => editor };
}

/** 每一場地點欄現在印的字。 */
const shown = (editor: Editor) =>
  [0, 1, 2].map((i) => sceneLocations(editor.state.doc.child(i).attrs.location)[0]?.displayName);

const menuRow = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll(".entity-field__menu li")].find((li) => li.textContent?.includes(text))!;

/** 在第一場的地點欄把 chip 拿回來、改成新名字，然後展開 ✏️ 那一列。 */
const openRename = (container: HTMLElement) => {
  const field = container.querySelectorAll<HTMLElement>(".scene__chip--location")[0]!;
  fireEvent.mouseDown(field.querySelector(".entity-chip")!);
  fireEvent.change(field.querySelector("input")!, { target: { value: "海豚公寓客廳" } });
  fireEvent.mouseDown(menuRow(field, "把實體改名為"));
  return field;
};

afterEach(() => {
  cleanup();
});

describe("「那 N 場」包含編劇正站著的這一場 —— 改的是一筆引用，不是一整場", () => {
  it("同一場的登場人物欄也印著舊名時它算一場，選「連那 1 場一起改」才會跟上", async () => {
    const { container, editor } = await mount(sceneWithSpeaker(), ".block__speaker-field");
    const field = container.querySelector<HTMLElement>(".block__speaker-field")!;

    fireEvent.mouseDown(field.querySelector(".entity-chip")!);
    fireEvent.change(field.querySelector("input")!, { target: { value: "陳小明" } });
    // 對白那一筆已經拿在手上，還印著「小明」的是同一場的登場人物欄。
    expect(menuRow(field, "把實體改名為").textContent).toBe(
      "✏️ 把實體改名為「陳小明」（還有 1 場印著「小明」）",
    );

    fireEvent.mouseDown(menuRow(field, "把實體改名為"));
    fireEvent.mouseDown(menuRow(field, "連那 1 場一起改"));

    await waitFor(() =>
      expect(
        sceneAppearingCharacters(editor().state.doc.child(0).attrs.appearingCharacters),
      ).toEqual([{ characterId: XIAOMING, displayName: "陳小明" }]),
    );
  });
});

describe("把實體改名（票券 39）", () => {
  it("別場還印著舊名時先問 —— 數字是「還印著舊名的場次」，別名那一場不在裡面", async () => {
    const { container } = await mount();
    const field = openRename(container);

    // 手上那一筆已經從 doc 拿掉，所以另外印著「海豚公寓房間」的只剩第二場。
    expect([...field.querySelectorAll(".entity-field__menu li")].map((li) => li.textContent)).toEqual(
      ["只改這一筆的叫法 —— 那 1 場繼續印「海豚公寓房間」", "連那 1 場一起改成「海豚公寓客廳」"],
    );
  });

  it("「連那幾場一起改」→ 印著舊名的跟著換，取過別名的那一場不動", async () => {
    const { container, editor } = await mount();
    const field = openRename(container);

    fireEvent.mouseDown(menuRow(field, "連那 1 場一起改"));

    await waitFor(() =>
      expect(shown(editor())).toEqual(["海豚公寓客廳", "海豚公寓客廳", "未知大樓房間"]),
    );
  });

  it("「只改這一筆」→ 別場一個字都不動（別名住在引用上，ADR-0005）", async () => {
    const { container, editor } = await mount();
    const field = openRename(container);

    fireEvent.mouseDown(menuRow(field, "只改這一筆的叫法"));

    await waitFor(() =>
      expect(shown(editor())).toEqual(["海豚公寓客廳", "海豚公寓房間", "未知大樓房間"]),
    );
  });
});
