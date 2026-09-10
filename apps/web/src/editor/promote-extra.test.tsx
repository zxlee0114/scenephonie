// @vitest-environment jsdom
/**
 * 從群演裡升格一個人物 —— **特約**（票券 35）。
 *
 * 「服務生 x2 裡的其中一個要說歡迎光臨」這句話，票券 09 之後仍然無處可放：選齊聲那列會變成
 * 兩個人齊聲，選「建立新實體」會生出一筆人物**而群演還是 x2**（多算一個背景演員）。
 * 這一張票補的就是那個動作。
 *
 * 升格的定義收斂成一句話：**`resolve(編劇打的字)` ＋ 本場那批群演減一**。人物那一半不新增
 * 任何邏輯 —— 命中既有存在人物就是那一位，沒命中就建一筆新的，與這一欄本來的三列同一條路。
 * 系統**不替人物取名**（開票時的甲乙丙已撤，見票券）。
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
import { afterEach, describe, expect, it } from "vitest";

import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const scene = (attrs: Record<string, unknown>, blocks: unknown[]) =>
  kernelSchema.node(
    "scene",
    { sceneId: mintSceneId(), ...attrs },
    blocks as never,
  );

const docJSON = (...scenes: unknown[]) =>
  kernelSchema.node("doc", null, scenes as never).toJSON() as object;

function Harness({
  doc,
  onEditor,
  characters = [],
}: {
  doc: object;
  onEditor?: (e: Editor) => void;
  /** 專案的名字目錄（伺服器餵進來的那一份）。命中既有人物那條路要靠它。 */
  characters?: { id: string; name: string }[];
}) {
  const editor = useScreenplayEditor(doc);
  useEffect(() => {
    if (editor) onEditor?.(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider initial={{ characters, locations: [] }}>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

const SPEAKER = ".block__speaker-field";

const speakerInput = (container: HTMLElement) =>
  waitFor(() => {
    const el = container.querySelector<HTMLInputElement>(`${SPEAKER} input`);
    expect(el).not.toBeNull();
    return el!;
  });

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll(`${SPEAKER} .entity-field__menu li`)].map(
    (li) => li.textContent ?? "",
  );

/** 升格那一列（措辭以「升格」開頭，與齊聲、建立新實體分得開）。 */
const promoteRow = (container: HTMLElement) =>
  [
    ...container.querySelectorAll<HTMLElement>(
      `${SPEAKER} .entity-field__menu li`,
    ),
  ].find((li) => (li.textContent ?? "").includes("升格"));

const extrasOf = (editor: Editor, index = 0) =>
  sceneExtras(editor.state.doc.child(index).attrs.extras);

const speakerOf = (editor: Editor, index = 0) =>
  editor.state.doc.child(index).child(0).attrs.character as {
    id: string;
    displayName: string;
  };

/** 本場有 `服務生 x2`，一句台詞等著人講。 */
const waiterScene = (count = 2, extraId = mintExtraId()) =>
  scene({ extras: [{ extraId, description: "服務生", count }] }, [
    kernelSchema.node("dialogue", null, [kernelSchema.text("歡迎光臨")]),
  ]);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("升格那一列：與「齊聲」並排，語意分得清楚", () => {
  it("本場有服務生 x2 時，打「服務生」三列各自說出自己是什麼", async () => {
    const { container } = render(<Harness doc={docJSON(waiterScene())} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });

    await waitFor(() =>
      expect(rows(container)).toEqual([
        // 齊聲與升格是「那批人」的兩種讀法，所以相鄰；下面兩列是別的東西
        // （「剛好同名的另一個人」與「再開一批新的背景演員」，票券 08／09 既有）。
        "👥 服務生",
        "👤 從「服務生 x2」裡升格一個人 —— 新的人物「服務生」（群演剩 1 人）",
        "＋ 建立新實體「服務生」",
        "👥 新增群演「服務生」1 人",
      ]),
    );
  });

  it("那批人只剩一個時，措辭講明白整筆會消失（不是「剩 0 人」）", async () => {
    const { container } = render(<Harness doc={docJSON(waiterScene(1))} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });

    await waitFor(() =>
      expect(promoteRow(container)?.textContent).toBe(
        "👤 從「服務生 x1」裡升格一個人 —— 新的人物「服務生」（這批群演就此用完）",
      ),
    );
  });

  it("本場沒有那批群演時沒有這一列 —— 別場的群演升格不了", async () => {
    const here = scene({}, [
      kernelSchema.node("dialogue", null, [kernelSchema.text("歡迎光臨")]),
    ]);
    const elsewhere = scene({ extras: [{ extraId: mintExtraId(), description: "服務生", count: 2 }] }, [
      kernelSchema.node("action", null, [kernelSchema.text("別場")]),
    ]);
    const { container } = render(<Harness doc={docJSON(here, elsewhere)} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });

    await waitFor(() =>
      expect(rows(container)).toContain("＋ 建立新實體「服務生」"),
    );
    expect(promoteRow(container)).toBeUndefined();
  });
});

describe("升格 ＝ resolve(打的字) ＋ 那批人減一，同一個 transaction", () => {
  it("多一筆人物、群演變 x1、對白引用指向那筆人物", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);

    await waitFor(() =>
      expect(extrasOf(editor)).toEqual([expect.objectContaining({ count: 1 })]),
    );
    expect(extrasOf(editor)[0]!.description).toBe("服務生");
    // 那個人是**人物**（ch_），不是群演 —— 他有跨場次的身分，副導要單獨試戲。
    expect(speakerOf(editor).id.startsWith("ch_")).toBe(true);
    expect(speakerOf(editor).displayName).toBe("服務生");
  });

  it("最後一個被拉走 → 那筆群演整筆消失，不是留 0 人", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene(1))} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);

    await waitFor(() =>
      expect(speakerOf(editor).id.startsWith("ch_")).toBe(true),
    );
    expect(extrasOf(editor)).toEqual([]);
  });

  it("⌘Z 一次回到升格前 —— 群演與對白引用一起退", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);
    await waitFor(() => expect(extrasOf(editor)[0]!.count).toBe(1));

    editor.commands.undo();

    await waitFor(() => expect(extrasOf(editor)[0]!.count).toBe(2));
    expect(editor.state.doc.child(0).child(0).attrs.character).toBeNull();
  });

  it("不自動掛進登場人物欄（票券 10 的提示才是那條路）", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);

    await waitFor(() => expect(extrasOf(editor)[0]!.count).toBe(1));
    expect(editor.state.doc.child(0).attrs.appearingCharacters).toBeNull();
  });
});

describe("名字就是編劇打的字", () => {
  it("打「服務生小李」（以描述開頭）也出現這一列，人物就叫服務生小李", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    // 今天齊聲那列的條件是 `描述.includes(query)`，打這五個字不命中 —— 而這正是編劇心裡
    // 已經有名字的情況。看不到升格列的代價不是名字難看，是**人數少算**。
    fireEvent.change(input, { target: { value: "服務生小李" } });

    await waitFor(() =>
      expect(promoteRow(container)?.textContent).toBe(
        "👤 從「服務生 x2」裡升格一個人 —— 新的人物「服務生小李」（群演剩 1 人）",
      ),
    );
    fireEvent.mouseDown(promoteRow(container)!);

    await waitFor(() =>
      expect(speakerOf(editor).displayName).toBe("服務生小李"),
    );
    expect(extrasOf(editor)[0]!.count).toBe(1);
  });

  it("打的字命中一筆既有**存在**人物 → 先講明白會指向那一位，不憑空鑄新的", async () => {
    let editor!: Editor;
    // 第 1 場已經有一位人物「服務生小李」（被引用著，所以他存在）；第 2 場也有 服務生 x2。
    const first = scene({}, [
      kernelSchema.node("dialogue", { character: { id: "ch_xiaoli", displayName: "服務生小李" } }, [
        kernelSchema.text("這邊請"),
      ]),
    ]);
    const { container } = render(
      <Harness
        doc={docJSON(first, waiterScene())}
        characters={[{ id: "ch_xiaoli", name: "服務生小李" }]}
        onEditor={(e) => (editor = e)}
      />,
    );
    const input = (await waitFor(() => {
      const all = container.querySelectorAll<HTMLInputElement>(`${SPEAKER} input`);
      expect(all).toHaveLength(2);
      return all;
    }))[1]!;

    fireEvent.change(input, { target: { value: "服務生小李" } });

    await waitFor(() =>
      expect(promoteRow(container)?.textContent).toBe(
        "👤 從「服務生 x2」裡升格一個人 —— 服務生小李（1 場）（群演剩 1 人）",
      ),
    );
    fireEvent.mouseDown(promoteRow(container)!);

    // 同一筆人物，不是第二個服務生小李 —— 人物表不多一列。
    await waitFor(() => expect(extrasOf(editor, 1)[0]!.count).toBe(1));
    expect(speakerOf(editor, 1).id).toBe("ch_xiaoli");

    // 命中既有那條路也是一次 ⌘Z —— 新鑄與命中不是兩種 undo 行為。
    editor.commands.undo();
    await waitFor(() => expect(extrasOf(editor, 1)[0]!.count).toBe(2));
    expect(editor.state.doc.child(1).child(0).attrs.character).toBeNull();
  });
});

describe("這一列走的是選單本來那套規矩", () => {
  it("鍵盤也到得了：↓ 移到升格那列、Enter 按下去（不是只有滑鼠）", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    // 第一列是齊聲，↓ 一次就到升格那列。
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => expect(promoteRow(container)!.className).toContain("is-active"));
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(extrasOf(editor)[0]!.count).toBe(1));
    expect(speakerOf(editor).id.startsWith("ch_")).toBe(true);
  });

  it("注音組字期間按不到 —— 浮出來的是唯讀預覽，升格那列根本不在（§7.6）", async () => {
    const { container } = render(<Harness doc={docJSON(waiterScene())} />);
    const input = await speakerInput(container);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "服務生" } });

    // 組字中選單完全不動作：可操作的那份一列都沒有（預覽那份不算，它 aria-hidden 也按不到）。
    await waitFor(() => expect(rows(container)).toEqual([]));
    expect(promoteRow(container)).toBeUndefined();

    fireEvent.compositionEnd(input, { currentTarget: { value: "服務生" } });

    // 送出之後才輪到我們。
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
  });
});

describe("同一批人升格兩次", () => {
  it("x2 連拉兩個 → 第二次之後那筆群演整批消失，兩位都是人物", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);
    await waitFor(() => expect(extrasOf(editor)[0]!.count).toBe(1));

    // 第二個人：他是另一位特約，所以編劇打的是另一個名字。
    fireEvent.change(input, { target: { value: "服務生小李" } });
    await waitFor(() =>
      expect(promoteRow(container)?.textContent).toContain("這批群演就此用完"),
    );
    fireEvent.mouseDown(promoteRow(container)!);

    await waitFor(() => expect(extrasOf(editor)).toEqual([]));
    // 齊聲：兩位具名角色說同一句（人物欄是多值）。兩筆都是人物，不是群演。
    const speakers = editor.state.doc.child(0).child(0).attrs.character as { id: string }[];
    expect(speakers.map((r) => r.id.startsWith("ch_"))).toEqual([true, true]);
  });
});

describe("升格之後的命名提示", () => {
  const note = (container: HTMLElement) =>
    container.querySelector(`${SPEAKER} .entity-field__note--naming`);

  it("升格之後才出現，且不擋任何寫入", async () => {
    const { container } = render(<Harness doc={docJSON(waiterScene())} />);
    const input = await speakerInput(container);

    expect(note(container)).toBeNull();

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    expect(note(container)).toBeNull(); // 按下去之前還沒有

    fireEvent.mouseDown(promoteRow(container)!);

    await waitFor(() => expect(note(container)).not.toBeNull());
    expect(note(container)!.textContent).toContain("識別演員");
  });

  it("提示掛著的時候照樣寫得進去 —— 它是建議不是規則", async () => {
    let editor!: Editor;
    const { container } = render(
      <Harness doc={docJSON(waiterScene())} onEditor={(e) => (editor = e)} />,
    );
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);
    await waitFor(() => expect(note(container)).not.toBeNull());

    // 提示還在，再加一位齊聲的說話者。
    fireEvent.change(input, { target: { value: "老闆" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      const speakers = editor.state.doc.child(0).child(0).attrs.character as { displayName: string }[];
      expect(speakers.map((r) => r.displayName)).toEqual(["服務生", "老闆"]);
    });
    expect(note(container)).not.toBeNull(); // 寫入沒有把它收掉，只有失焦才收
  });

  it("這一欄失焦就收 —— 他移開就是決定了，不必按 ✕，也就不存任何狀態", async () => {
    const { container } = render(<Harness doc={docJSON(waiterScene())} />);
    const input = await speakerInput(container);

    fireEvent.change(input, { target: { value: "服務生" } });
    await waitFor(() => expect(promoteRow(container)).toBeDefined());
    fireEvent.mouseDown(promoteRow(container)!);
    await waitFor(() => expect(note(container)).not.toBeNull());

    fireEvent.blur(input);

    await waitFor(() => expect(note(container)).toBeNull());
  });
});
