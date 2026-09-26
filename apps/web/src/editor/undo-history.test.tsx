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
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintExtraId,
  mintLocationId,
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

// `cleanup()` 而不是清空 `body.innerHTML`：後者只是把 DOM 拿掉，React 樹沒有卸載，上一條
// 測試那個 editor 於是還活著、`StrayHistoryKey` 掛在 window 上的那顆監聽也還在。窗層那條
// 退路是**全域**的（焦點掉到 body 時才有人接得住），留著的話下一條測試按的 ⌘Z 會先被前一個
// editor 接走（票券 53 實作時踩到）。
afterEach(cleanup);

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
    // 而且**是待選的樣子**：純輸入框，沒有 chip 外框、沒有 ✚／✓ 記號（2026-09-12 驗收
    // 回饋 —— 那是「正在編輯一筆既有引用」，不是編劇按 ⌘Z 要退回的那一刻）。
    expect(
      container.querySelector(`${LOCATION} .entity-field__input-chip`),
    ).toBeNull();
  });

  it("原封不動再定案一次 → 編劇看得到的地方一列都不多（留下的是孤兒，ADR-0005）", async () => {
    let minted = 0;
    const createEntity = vi.fn(async ({ name }: { name: string }) => ({
      id: `lo_${++minted}`,
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

    // ⌘Z 之後欄位什麼都不握 —— 那串字是待選階段的字，所以這一次是重新建一筆。
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull(),
    );
    // 目錄裡確實多了一筆，而它沒有任何引用 —— 孤兒「不出現在任何地方」（ADR-0005，見
    // `db/schema.ts` 的實體表那段）。編劇看得到的是這一場的地點，而它只有一個。
    expect(createEntity).toHaveBeenCalledTimes(2);
    expect(editor.state.doc.firstChild!.attrs.location).toEqual({
      locationId: "lo_2",
      displayName: "河堤",
    });
  });

  it("第二下 ⌘Z：欄位塞回去的那串字被收掉，文件不再退一步", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(input.value).toBe("河堤"));

    const before = JSON.stringify(editor.state.doc.toJSON());
    fireEvent.keyDown(input, undoKey);

    // 收掉的是那串字，不是文件的下一步 —— 原生 undo 也沒份（見 `restored`）。
    await waitFor(() => expect(input.value).toBe(""));
    expect(JSON.stringify(editor.state.doc.toJSON())).toBe(before);
  });

  it("欄位塞回去的字被改過，第二下 ⌘Z 照樣收掉整串（那串字的出身沒變）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    fireEvent.keyDown(input, undoKey);
    await waitFor(() => expect(input.value).toBe("河堤"));
    fireEvent.change(input, { target: { value: "河堤邊" } });

    const before = JSON.stringify(editor.state.doc.toJSON());
    fireEvent.keyDown(input, undoKey);

    await waitFor(() => expect(input.value).toBe(""));
    expect(JSON.stringify(editor.state.doc.toJSON())).toBe(before);
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
            extras: [{ extraId, description: "服務生", countValue: { kind: "exact", count: 2 } }],
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
      expect(
        sceneExtras(editor.state.doc.child(0).attrs.extras)[0]!.countValue,
      ).toEqual({ kind: "exact", count: 1 }),
    );
    // 升格成功之後那一行命名提示（票券 35）。
    expect(
      container.querySelector(`${SPEAKER} .entity-field__note--naming`),
    ).not.toBeNull();

    fireEvent.keyDown(input, undoKey);

    await waitFor(() => expect(input.value).toBe("服務生"));
    // 升格被撤銷了，那一行跟著收 —— 留著就是在講一個不存在的人物（2026-09-12 驗收回饋）。
    expect(
      container.querySelector(`${SPEAKER} .entity-field__note--naming`),
    ).toBeNull();
    expect(sceneExtras(editor.state.doc.child(0).attrs.extras)[0]!.countValue).toEqual({
      kind: "exact",
      count: 2,
    });
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

  it("那一下退掉的是別的動作時，欄位不插手（拿掉一顆 chip 之後的 ⌘Z）", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await newLocationChip(container);

    // ⚠️ 等過歷史的分組窗（`newGroupDelay`，500ms）—— 不等的話這兩步會被併成一次 undo，
    // 那就變成上一條測試的情況，不是這一條要釘的「退掉的是別的動作」。
    await new Promise((resolve) => setTimeout(resolve, 600));
    // × ＝ 拿掉這一場對它的引用。這一步才是歷史最上面那一步了。
    fireEvent.mouseDown(
      container.querySelector(`${LOCATION} .entity-chip__remove`)!,
    );
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).toBeNull(),
    );

    fireEvent.keyDown(input, undoKey);

    // 退回來的是那一顆 chip，不是「定案」那一步 —— 舊快照不該被誤用。
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).not.toBeNull(),
    );
    expect(input.value).toBe("");
  });

  it("兩筆定案被歷史併成一次 undo 時，一個名字都不接回來", async () => {
    const CHARACTERS = ".scene__chip--character";
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    const input = await fieldInput(container, CHARACTERS);

    // 連著兩筆（ProseMirror 的歷史會把 500ms 內的相鄰步驟併成一組 —— 量過，確實會）。
    for (const name of ["小李", "小華"]) {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() =>
        expect(
          container.querySelectorAll(`${CHARACTERS} .entity-chip`).length,
        ).toBeGreaterThan(0),
      );
    }
    await waitFor(() =>
      expect(
        container.querySelectorAll(`${CHARACTERS} .entity-chip`),
      ).toHaveLength(2),
    );

    fireEvent.keyDown(input, undoKey);

    await waitFor(() =>
      expect(
        editor.state.doc.firstChild!.attrs.appearingCharacters,
      ).toBeNull(),
    );
    // 兩顆一起沒了 —— 這一下撤掉的不是「那一筆定案」，所以欄位不接手。把「小華」塞回框裡
    // 會讀成「只撤了一筆」，而「小李」就這樣無聲消失了。
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

/**
 * 焦點已經離開整個欄位之後的那一下 ⌘Z（票券 53）。
 *
 * 票券 37 管的是「焦點還在欄位裡」那一格，這裡是另一半：拿起一批群演、把字刪光、**點到
 * 一塊誰都接不住的空白**放手 —— 那一刻 `document.activeElement` 是 `body`，chip row 上的
 * `forwardHistoryKey` 再也收不到那顆鍵，於是它歸瀏覽器，而瀏覽器對剛剛被清空的 `<input>`
 * 做的是原生 undo：把刪掉的字整串反白塞回框裡。回來的不是那一批群演，是一串裸字。
 *
 * 規則（與 37 同一條的另一半）：**焦點不在任何欄位手上時，那一下歸文件** —— 整顆 chip
 * 回來，`extraId` 與人數都是原本那一個，而欄位一個字都不插手。
 */
describe("放手之後的 ⌘Z（票券 53）", () => {
  const EXTRAS = ".scene__chip--extras";

  const docWithExtra = (extraId: string) =>
    kernelSchema
      .node("doc", null, [
        kernelSchema.node(
          "scene",
          {
            sceneId: mintSceneId(),
            extras: [{ extraId, description: "路人", countValue: { kind: "exact", count: 8 } }],
          },
          [kernelSchema.node("action", null, [kernelSchema.text("內文")])],
        ),
      ])
      .toJSON() as object;

  /** 拿起那顆 chip、把字刪光、點到別處放手 —— chip 外殼跟著消失。 */
  async function letGoOfTheExtra(container: HTMLElement) {
    const chip = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(`${EXTRAS} .entity-chip`);
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.mouseDown(chip);
    const input = await fieldInput(container, EXTRAS);
    await waitFor(() => expect(input.value).toBe("路人"));
    fireEvent.change(input, { target: { value: "" } });
    // 真的把焦點交出去（`fireEvent.blur` 只發事件，`document.activeElement` 還是那個框）。
    input.blur();
    await waitFor(() =>
      expect(
        container.querySelector(`${EXTRAS} .entity-field__input-chip`),
      ).toBeNull(),
    );
    return input;
  }

  it("那一批回來時，`extraId` 與人數都是原本那一個", async () => {
    const extraId = mintExtraId();
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docWithExtra(extraId)} onEditor={(e) => (editor = e)} />,
    );
    await letGoOfTheExtra(container);
    expect(sceneExtras(editor.state.doc.child(0).attrs.extras)).toHaveLength(0);

    // 焦點在 body 上 —— chip row 收不到，這一下只有窗層那個退路接得住。
    fireEvent.keyDown(document.body, undoKey);

    await waitFor(() =>
      expect(sceneExtras(editor.state.doc.child(0).attrs.extras)).toHaveLength(
        1,
      ),
    );
    const back = sceneExtras(editor.state.doc.child(0).attrs.extras)[0]!;
    expect(back.extraId).toBe(extraId);
    expect(back.countValue).toEqual({ kind: "exact", count: 8 });
  });

  it("欄位不會被塞進一串字，選單也不會在那一刻說「新增」", async () => {
    const extraId = mintExtraId();
    const { container } = render(<Harness doc={docWithExtra(extraId)} />);
    const input = await letGoOfTheExtra(container);

    fireEvent.keyDown(document.body, undoKey);

    await waitFor(() =>
      expect(container.querySelectorAll(`${EXTRAS} .entity-chip`)).toHaveLength(
        1,
      ),
    );
    expect(input.value).toBe("");
    expect(menuRows(container.querySelector(EXTRAS)!)).toHaveLength(0);
  });

  /**
   * 人數子選單那個格子沿用同一條線（票券 48「為什麼 blocked by 37」）。
   *
   * 那串 `3~` 是**編劇打了還沒定案的字**，所以 `forwardHistoryKey` 不接手，⌘Z 歸原生 undo
   * ——字自己回來，文件一步都不退。群演欄自己另寫一套 undo 還字的機制，等於同一個 bug 有
   * 兩種修法，而其中一種只蓋得到人數格。
   */
  it("人數格裡打到一半的字歸原生 undo —— 文件一步都不退（票券 48 沿用 37）", async () => {
    const extraId = mintExtraId();
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docWithExtra(extraId)} onEditor={(e) => (editor = e)} />,
    );
    const chip = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(`${EXTRAS} .entity-chip`);
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.mouseDown(chip);

    // `修改數量…` 那一列 → 人數格。
    const field = container.querySelector(EXTRAS)!;
    const at = menuRows(field).findIndex((r) => r.includes("修改數量"));
    expect(at).toBeGreaterThanOrEqual(0);
    fireEvent.mouseDown(
      [...field.querySelectorAll(".entity-field__menu li:not(.entity-field__menu-hint)")][at]!,
    );
    const box = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(".entity-field__count-input");
      expect(el).not.toBeNull();
      return el!;
    });

    fireEvent.change(box, { target: { value: "3~" } });
    fireEvent.keyDown(box, undoKey);

    // 文件沒有被動到 —— 那一下不是「撤銷一筆定案」，是「撤銷我剛打的那兩個字」。
    // 拿起那顆 chip 時它已經從 doc 上撤掉了（`editExtra`），所以「文件沒退」量的是**它沒有
    // 被退回來**：⌘Z 真的到了文件的話，這一刻 `extras` 會變回一筆，編輯狀態當場對不上。
    expect(editor.state.doc.child(0).attrs.extras).toHaveLength(0);
    expect(container.querySelector(".entity-field__count-input")).not.toBeNull();
  });

  /**
   * 框空了就到底 —— 那一下**不會溜到文件上**（使用者裁決 2026-09-12）。
   *
   * 沒有這條線時：字退光之後的 ⌘Z 往上冒到 `forwardHistoryKey`／`strayHistoryKey`，兩者都只
   * 問「框裡有沒有沒定案的字」，空框 ＝ 沒有，於是那一下把「剛拿起這一批」從文件退回來 ——
   * 欄位裡於是同時有一顆唯讀 chip 與手上這一筆編輯殼，同一批人兩份（使用者回報 2026-09-12）。
   */
  it("人數格空著時的 ⌘Z 留在框裡 —— 手上那一批不會變成兩份（票券 48）", async () => {
    const extraId = mintExtraId();
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docWithExtra(extraId)} onEditor={(e) => (editor = e)} />,
    );
    const chip = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(`${EXTRAS} .entity-chip`);
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.mouseDown(chip);

    const field = container.querySelector(EXTRAS)!;
    const at = menuRows(field).findIndex((r) => r.includes("修改數量"));
    fireEvent.mouseDown(
      [...field.querySelectorAll(".entity-field__menu li:not(.entity-field__menu-hint)")][at]!,
    );
    const box = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(".entity-field__count-input");
      expect(el).not.toBeNull();
      return el!;
    });

    // 打了字、再退光（原生 undo 在 jsdom 裡量不到，直接把框清成空的 —— 這一條量的是
    // **空框那一下**，不是字怎麼回來的）。
    fireEvent.change(box, { target: { value: "3~5" } });
    fireEvent.change(box, { target: { value: "" } });

    fireEvent.keyDown(box, undoKey);
    fireEvent.keyDown(box, undoKey);

    // 文件一步都沒退：那一批仍然在手上，欄位裡沒有第二顆 chip。
    expect(editor.state.doc.child(0).attrs.extras).toHaveLength(0);
    expect(container.querySelectorAll(`${EXTRAS} .entity-chip`)).toHaveLength(0);
    // 選單還開著、游標還停在那個空框上。
    expect(container.querySelector(".entity-field__count-input")).not.toBeNull();
  });

  it("人物／地點欄同一套：放手之後的 ⌘Z 把那一筆原封還回來", async () => {
    // 地點是**稿子裡本來就有的**那一筆，不是這一刻打出來的 —— 打出來的話「定案」與「拿起來
    // 改」會落在歷史的同一個分組窗裡（500ms），一次 ⌘Z 兩步一起退，量到的就不是這張票了。
    const before = { locationId: mintLocationId(), displayName: "河堤" };
    const doc = kernelSchema
      .node("doc", null, [
        kernelSchema.node(
          "scene",
          { sceneId: mintSceneId(), location: before },
          [kernelSchema.node("action", null, [kernelSchema.text("內文")])],
        ),
      ])
      .toJSON() as object;

    let editor!: Editor;
    const { container } = render(
      <Harness doc={doc} onEditor={(e) => (editor = e)} />,
    );
    const input = await fieldInput(container, LOCATION);

    // 拿起那顆 chip、字刪光、點到別處放手。
    fireEvent.mouseDown(container.querySelector(`${LOCATION} .entity-chip`)!);
    await waitFor(() => expect(input.value).toBe("河堤"));
    fireEvent.change(input, { target: { value: "" } });
    input.blur();
    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).toBeNull(),
    );

    fireEvent.keyDown(document.body, undoKey);

    await waitFor(() =>
      expect(editor.state.doc.firstChild!.attrs.location).toEqual(before),
    );
    expect(input.value).toBe("");
  });

  it("注音組字期間的那一下仍然整顆還給 IME（§7.6）", async () => {
    const extraId = mintExtraId();
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docWithExtra(extraId)} onEditor={(e) => (editor = e)} />,
    );
    await letGoOfTheExtra(container);

    fireEvent.keyDown(document.body, { ...undoKey, isComposing: true });

    // 文件一動也沒動 —— 那一顆鍵從頭到尾都是 IME 的。
    expect(sceneExtras(editor.state.doc.child(0).attrs.extras)).toHaveLength(0);
  });
});

/**
 * **握著一批**、框裡空著時的那一下 ⌘Z（票券 54）。
 *
 * `typingInField` 只答得出「框裡有沒有編劇沒定案的字」—— 空框 ＝ 沒有，於是那一下歸文件，
 * 而文件上少的那一步正是「剛把它拿起來」：退回來之後 chip 回到欄位裡、手上卻還握著同一筆，
 * 畫面上同一批人兩份，定案時兩筆同 id 一起躺在 doc 上。
 *
 * 裁決（使用者 2026-09-26，沿用 48 在人數格上立的那條）：**欄位的鍵不該有欄位以外的後果**。
 * 握著東西時 ⌘Z／⌘⇧Z 只在那個框自己的歷史裡走，框空了就到底 —— 文件一步都不動，游標留在
 * 空框上。三個欄位同一套。
 */
describe("握著一筆時的 ⌘Z 留在框裡（票券 54）", () => {
  const EXTRAS = ".scene__chip--extras";

  /**
   * 等文件退回去之後的那一次重繪 —— 退回來的那一顆 chip 要經過 node view 才畫得出來，
   * 按下去的當下量不到「兩份」（同 `whenFieldBecomes` 的 ①）。
   */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const docWith = (
    sceneAttrs: Record<string, unknown>,
    block: "action" | "dialogue" = "action",
    blockAttrs: Record<string, unknown> | null = null,
  ) =>
    kernelSchema
      .node("doc", null, [
        kernelSchema.node("scene", { sceneId: mintSceneId(), ...sceneAttrs }, [
          kernelSchema.node(block, blockAttrs, [kernelSchema.text("內文")]),
        ]),
      ])
      .toJSON() as object;

  /** 點那顆 chip 拿起來、把字刪光 —— 手上還握著它（見 `letGo`：再一顆 Backspace 才放手）。 */
  async function holdAndClear(
    container: HTMLElement,
    field: string,
    name: string,
  ) {
    const chip = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(`${field} .entity-chip`);
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.mouseDown(chip);
    const input = await fieldInput(container, field);
    await waitFor(() => expect(input.value).toBe(name));
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() =>
      expect(container.querySelectorAll(`${field} .entity-chip`)).toHaveLength(
        0,
      ),
    );
    return input;
  }

  it("群演名稱框：字刪光之後的 ⌘Z／⌘⇧Z 不會把那一批退回來", async () => {
    const extraId = mintExtraId();
    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={docWith({
          extras: [{ extraId, description: "路人", countValue: { kind: "exact", count: 8 } }],
        })}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await holdAndClear(container, EXTRAS, "路人");
    const held = editor.state.doc.toJSON();

    // 每一下各自量：⌘⇧Z 會把 ⌘Z 退掉的那一步做回去，混在一起量會互相抵銷。
    fireEvent.keyDown(input, undoKey);
    await settle();
    expect(editor.state.doc.toJSON()).toEqual(held);
    fireEvent.keyDown(input, undoKey);
    fireEvent.keyDown(input, redoKey);
    await settle();

    // 文件一步都沒退，欄位裡也沒有冒出唯讀的那一顆 —— 手上那一筆仍然是唯一的一份。
    expect(editor.state.doc.toJSON()).toEqual(held);
    expect(container.querySelectorAll(`${EXTRAS} .entity-chip`)).toHaveLength(0);
    expect(
      container.querySelector(`${EXTRAS} .entity-field__input-chip`),
    ).not.toBeNull();
    expect(input.value).toBe("");
  });

  it("群演名稱框：之後再定案，`extras` 裡只有一筆那個 `extraId`，而且是改過的那一筆", async () => {
    const extraId = mintExtraId();
    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={docWith({
          extras: [{ extraId, description: "路人", countValue: { kind: "exact", count: 8 } }],
        })}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await holdAndClear(container, EXTRAS, "路人");
    fireEvent.keyDown(input, undoKey);
    await settle();

    // 換一個名字：兩筆同 id 會被寫入那一層拒絕的話，doc 上剩的會是**舊的**那一筆 ——
    // 同一個裂縫的另一種樣子（改的字無聲消失），所以一起量。
    fireEvent.change(input, { target: { value: "路人甲" } });
    input.blur();

    // 等**定案那一下**真的發生（編輯殼收掉）才量 —— 沒修之前 ⌘Z 已經先把一筆退回 doc 了，
    // 直接等「一筆」會在定案之前就放行。
    await waitFor(() =>
      expect(
        container.querySelector(`${EXTRAS} .entity-field__input-chip`),
      ).toBeNull(),
    );
    const extras = sceneExtras(editor.state.doc.child(0).attrs.extras);
    expect(extras).toHaveLength(1);
    expect(extras[0]).toEqual({
      extraId,
      description: "路人甲",
      countValue: { kind: "exact", count: 8 },
    });
  });

  it("地點欄同一套：握著、字刪光、⌘Z —— 文件不動", async () => {
    const before = { locationId: mintLocationId(), displayName: "河堤" };
    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={docWith({ location: before })}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await holdAndClear(container, LOCATION, "河堤");
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();

    fireEvent.keyDown(input, undoKey);
    await settle();
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
    fireEvent.keyDown(input, redoKey);
    await settle();

    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
    expect(container.querySelectorAll(`${LOCATION} .entity-chip`)).toHaveLength(
      0,
    );
    expect(input.value).toBe("");
  });

  it("對白人物欄同一套（那一欄的 ⌘Z 走 `onKeyDown` prop，不靠冒泡）", async () => {
    const speaker = { id: "ch_1", displayName: "小明" };
    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={docWith({}, "dialogue", { character: [speaker] })}
        characters={[{ id: "ch_1", name: "小明" }]}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await holdAndClear(container, SPEAKER, "小明");
    const held = editor.state.doc.toJSON();

    fireEvent.keyDown(input, undoKey);
    await settle();
    expect(editor.state.doc.toJSON()).toEqual(held);
    fireEvent.keyDown(input, redoKey);
    await settle();

    expect(editor.state.doc.toJSON()).toEqual(held);
    expect(container.querySelectorAll(`${SPEAKER} .entity-chip`)).toHaveLength(
      0,
    );
  });

  /**
   * 原生那一下**放不放**（`fireEvent` 回 `false` ＝ 被 `preventDefault`）。jsdom 沒有原生
   * undo，所以量的是「交不交給瀏覽器」，瀏覽器做回來的那一次 input 由 `nativeUndid` 模擬。
   */
  const passes = (input: HTMLInputElement, key: object) =>
    fireEvent.keyDown(input, key);
  const nativeUndid = (input: HTMLInputElement, value: string, redo = false) =>
    fireEvent.input(input, {
      target: { value },
      inputType: redo ? "historyRedo" : "historyUndo",
    });

  /**
   * 人工驗收撈到的（2026-09-27）：握著 `路人（8）`、清空、⌘Z 三下、⌘⇧Z —— 人物欄冒出
   * `小明小明`。原生堆疊是整份頁面共用的，框自己那幾步退光之後的那一下退到了別的框。
   */
  it("群演名稱框：原生 undo 只退這個框自己的那幾步，到底就擋（不會退到別的欄位）", async () => {
    const extraId = mintExtraId();
    const { container } = render(
      <Harness
        doc={docWith({
          extras: [{ extraId, description: "路人", countValue: { kind: "exact", count: 8 } }],
        })}
      />,
    );
    const input = await holdAndClear(container, EXTRAS, "路人");

    // 清空是這個框自己的一步 —— 第一下放給原生，字回來。
    expect(passes(input, undoKey)).toBe(true);
    nativeUndid(input, "路人");
    // 回到拿起時的樣子了：再下去就是別人的，擋掉。
    expect(passes(input, undoKey)).toBe(false);
    expect(passes(input, undoKey)).toBe(false);
    // ⌘⇧Z 只做回剛剛放行的那一步。
    expect(passes(input, redoKey)).toBe(true);
    nativeUndid(input, "", true);
    expect(passes(input, redoKey)).toBe(false);
  });

  it("拿起來還沒動過 —— ⌘Z 直接到底（堆疊頂端不是這個框的）", async () => {
    const before = { locationId: mintLocationId(), displayName: "河堤" };
    const { container } = render(<Harness doc={docWith({ location: before })} />);
    fireEvent.mouseDown(
      await waitFor(() => {
        const el = container.querySelector<HTMLElement>(`${LOCATION} .entity-chip`);
        expect(el).not.toBeNull();
        return el!;
      }),
    );
    const input = await fieldInput(container, LOCATION);
    await waitFor(() => expect(input.value).toBe("河堤"));

    expect(passes(input, undoKey)).toBe(false);
    expect(passes(input, redoKey)).toBe(false);
  });

  it("人數格（新增那一側）：空著的 ⌘Z 不會退到名稱框剛打的字", async () => {
    const { container } = render(<Harness />);
    const name = await fieldInput(container, EXTRAS);
    fireEvent.change(name, { target: { value: "路人" } });
    fireEvent.keyDown(name, { key: "Enter" });
    const box = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(".entity-field__count-input");
      expect(el).not.toBeNull();
      return el!;
    });

    expect(passes(box, undoKey)).toBe(false);
    fireEvent.change(box, { target: { value: "3" } });
    expect(passes(box, undoKey)).toBe(true);
  });

  it("框裡有字時仍然是原生 undo —— 文件照樣不動（票券 37／53 那條線不退）", async () => {
    const before = { locationId: mintLocationId(), displayName: "河堤" };
    let editor!: Editor;
    const { container } = render(
      <Harness
        doc={docWith({ location: before })}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = await holdAndClear(container, LOCATION, "河堤");
    fireEvent.change(input, { target: { value: "河" } });

    const undo = new KeyboardEvent("keydown", { ...undoKey, bubbles: true, cancelable: true });
    input.dispatchEvent(undo);

    // 沒人 `preventDefault` ＝ 瀏覽器照做它自己的 undo。
    expect(undo.defaultPrevented).toBe(false);
    expect(editor.state.doc.firstChild!.attrs.location).toBeNull();
  });
});
