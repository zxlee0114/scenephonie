// @vitest-environment jsdom
/**
 * chip row 上的 ⌘Z（使用者回報 2026-09-10：新建 chip 之後要按兩次才清得掉）。
 *
 * 文件那一側從來只需要一次 —— 一個 chip ＝ 一支 command ＝ 一個 transaction，這裡第一條
 * 測試就是量它。問題出在**那一下到不了 ProseMirror**：Tiptap 的 `NodeView.stopEvent` 把
 * `INPUT` 上的鍵盤事件整個攔在 node view 裡，於是瀏覽器拿去做 input 自己的原生 undo。
 * `forwardHistoryKey` 把它送回去（見 `history-keys.ts`）。
 *
 * 第二個 describe 是同一顆鍵的**另一半**（票券 37）：文件退回去之後，那串字要回到輸入框。
 * 「⌘Z 撤銷的是『把字定案』這個動作，而那個動作的反面是字回來，不是字消失。」
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintExtraId,
  mintSceneId,
  sceneExtras,
  schema as kernelSchema,
} from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import type { EntityOption } from "./entity-field";
import { useScreenplayEditor } from "./use-screenplay-editor";

function docWithScene() {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId(), intExt: "內景" }, [
        kernelSchema.node("action", null, [kernelSchema.text("內文")]),
      ]),
    ])
    .toJSON() as object;
}

function Harness({
  onEditor,
  doc,
  locations = [],
  characters = [],
  createEntity,
}: {
  onEditor?: (e: Editor) => void;
  doc?: object;
  locations?: EntityOption[];
  characters?: EntityOption[];
  /** 有它才寫得回「伺服器」—— 要數「有沒有憑空多建一筆實體」就靠它（見票券 37 驗收）。 */
  createEntity?: (args: {
    projectId: string;
    kind: "character" | "location";
    name: string;
  }) => Promise<EntityOption | null>;
}) {
  const editor = useScreenplayEditor(doc ?? docWithScene());
  useEffect(() => {
    if (editor) onEditor?.(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider
      initial={{ characters, locations }}
      projectId={createEntity ? "pr_1" : undefined}
      createEntity={createEntity}
    >
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

const undoKey = { key: "z", code: "KeyZ", metaKey: true };
const redoKey = { ...undoKey, shiftKey: true };

const LOCATION = ".scene__chip--location";
const SPEAKER = ".block__speaker-field";

const fieldInput = (container: HTMLElement, selector: string, index = 0) =>
  waitFor(() => {
    const el =
      container.querySelectorAll<HTMLInputElement>(`${selector} input`)[index];
    expect(el).toBeDefined();
    return el!;
  });

/** 可以操作的那份選單（唯讀抬頭不算 —— 它按不到）。 */
const menuRows = (root: Element) =>
  [
    ...root.querySelectorAll(
      ".entity-field__menu li:not(.entity-field__menu-hint)",
    ),
  ].map((li) => li.textContent ?? "");

/** 地點欄打一個新名字並定案，回傳輸入框。 */
async function newLocationChip(container: HTMLElement, name = "河堤") {
  const input = await fieldInput(container, LOCATION);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(container.querySelectorAll(`${LOCATION} .entity-chip`)).toHaveLength(
      1,
    ),
  );
  return input;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("chip row 上的 ⌘Z", () => {
  it("一個新建的 chip ＝ 一支 command ＝ 一次 undo（文件那一側從來沒有兩次）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await newLocationChip(container);

    expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull();
    editor.commands.undo();
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
  });

  it("焦點還在欄位裡時按一次 ⌘Z，chip 就該不見", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    // 事件從 input 冒泡到 .scene__chips 的 onKeyDown —— 那是 ProseMirror 收不到的那一段。
    fireEvent.keyDown(input, undoKey);

    await waitFor(() =>
      expect(
        container.querySelectorAll(`${LOCATION} .entity-chip`),
      ).toHaveLength(0),
    );
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
  });

  it("⌘⇧Z 再把它做回來", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).toBeNull(),
    );

    fireEvent.keyDown(input, redoKey);
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull(),
    );
  });

  it("框裡還有沒定案的字時不接手 —— 那一下的 ⌘Z 是「撤銷我剛打的字」", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.change(input, { target: { value: "警局" } });
    fireEvent.keyDown(input, undoKey);

    // 文件沒有被動到：地點還在。原生 undo 去處理那幾個字，那是它的事。
    expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull();
  });
});

describe("⌘Z 撤銷一筆定案 → 那串字回到輸入框（票券 37）", () => {
  it("打字新建那條路：chip 消失、「河堤」回到框裡、選單停在待選", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);

    await waitFor(() => expect(input.value).toBe("河堤"));
    expect(container.querySelectorAll(`${LOCATION} .entity-chip`)).toHaveLength(
      0,
    );
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
    // 待選階段 ——「改選別的」是撤銷的理由，所以選單要是開著的。
    expect(menuRows(container.querySelector(LOCATION)!).length).toBeGreaterThan(
      0,
    );
  });

  it("字回來之後再按一次 ⌘Z → 歸原生 undo，文件不再退一步", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(input.value).toBe("河堤"));

    const before = JSON.stringify(editor.state.doc.toJSON());
    fireEvent.keyDown(input, undoKey);
    // 框裡有字 → `forwardHistoryKey` 不接手。撤掉那幾個字是原生 undo 的事（jsdom 裡不會
    // 真的發生），文件一個字都不該再退。
    expect(JSON.stringify(editor.state.doc.toJSON())).toBe(before);
  });

  it("原封不動再定案一次 → 同一筆實體，目錄不多一列", async () => {
    const createEntity = vi.fn(async ({ name }: { name: string }) => ({
      id: "lo_new",
      name,
    }));
    let editor!: Editor;
    const { container } = render(
      <Harness onEditor={(e) => (editor = e)} createEntity={createEntity} />,
    );
    const input = await newLocationChip(container);
    expect(createEntity).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(input.value).toBe("河堤"));

    // `editing.current` 有接回來，所以這一次走的是「原封放回，用回它自己的 id」。
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull(),
    );
    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(editor.state.doc.firstChild!.attrs.location).toEqual({
      locationId: "lo_new",
      displayName: "河堤",
    });
  });

  it("⌘⇧Z 把那一筆做回去 —— 框裡的字跟著收掉", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(input.value).toBe("河堤"));

    fireEvent.keyDown(input, redoKey);
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull(),
    );
    // 字回到 chip 上了，框裡不該還留著一份 —— 那會看起來像兩筆。
    expect(input.value).toBe("");
    expect(container.querySelectorAll(`${LOCATION} .entity-chip`)).toHaveLength(
      1,
    );
  });

  it("命中既有那條路一樣 —— 定案的是誰不影響「撤銷 ＝ 字回來」", async () => {
    const riverside = { id: "lo_1", name: "河堤" };
    const doc = kernelSchema
      .node("doc", null, [
        kernelSchema.node("scene", { sceneId: mintSceneId() }, [
          kernelSchema.node("action", null, [kernelSchema.text("一")]),
        ]),
        // 第二場先用著它 —— 孤兒不進自動補全（ADR-0005），命中列要有東西可命中。
        kernelSchema.node(
          "scene",
          {
            sceneId: mintSceneId(),
            location: { locationId: riverside.id, displayName: riverside.name },
          },
          [kernelSchema.node("action", null, [kernelSchema.text("二")])],
        ),
      ])
      .toJSON() as object;

    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={doc}
        locations={[riverside]}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await fieldInput(container, LOCATION);

    fireEvent.change(input, { target: { value: "河堤" } });
    await waitFor(() =>
      expect(menuRows(container.querySelector(LOCATION)!)[0]).toContain("河堤"),
    );
    fireEvent.keyDown(input, { key: "Enter" }); // 第一列＝命中既有
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).toEqual({
        locationId: "lo_1",
        displayName: "河堤",
      }),
    );

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(input.value).toBe("河堤"));
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
  });

  it("升格那條路：群演回到原本人數、chip 消失、名字回到框裡（同一次）", async () => {
    const extraId = mintExtraId();
    const doc = kernelSchema
      .node("doc", null, [
        kernelSchema.node(
          "scene",
          {
            sceneId: mintSceneId(),
            extras: [{ extraId, description: "服務生", count: 2 }],
          },
          [kernelSchema.node("dialogue", null, [kernelSchema.text("歡迎光臨")])],
        ),
      ])
      .toJSON() as object;

    let editor!: Editor;
    const { container } = render(
      <Harness doc={doc} onEditor={(e) => (editor = e)} />,
    );
    const input = await fieldInput(container, SPEAKER);

    fireEvent.change(input, { target: { value: "服務生" } });
    const promote = await waitFor(() => {
      const row = [
        ...container.querySelectorAll<HTMLElement>(
          `${SPEAKER} .entity-field__menu li`,
        ),
      ].find((li) => (li.textContent ?? "").includes("升格"));
      expect(row).toBeDefined();
      return row!;
    });
    fireEvent.mouseDown(promote);
    await waitFor(() =>
      expect(sceneExtras(editor.state.doc.child(0).attrs.extras)[0]!.count).toBe(
        1,
      ),
    );

    fireEvent.keyDown(input, undoKey);

    await waitFor(() => expect(input.value).toBe("服務生"));
    expect(sceneExtras(editor.state.doc.child(0).attrs.extras)[0]!.count).toBe(
      2,
    );
    expect(editor.state.doc.child(0).child(0).attrs.character).toBeNull();
  });

  it("焦點已經離開這一欄時：文件照退，欄位不會被塞進一串字", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.blur(input);
    // 焦點不在欄位裡，那一下落在 chip row 上（`forwardHistoryKey` 照樣送回文件）。
    fireEvent.keyDown(container.querySelector(".scene__chips")!, undoKey);

    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).toBeNull(),
    );
    expect(input.value).toBe("");
  });

  it("注音組字期間的 ⌘Z 仍然整顆還給 IME（§7.6）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, { ...undoKey, isComposing: true });

    expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull();
    expect(input.value).toBe("");
  });
});
