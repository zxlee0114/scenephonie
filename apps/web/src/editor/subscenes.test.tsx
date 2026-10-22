// @vitest-environment jsdom
/**
 * 子場次的手勢與畫面（票券 11）—— 用真的編輯器組裝（`useScreenplayEditor`）跑。
 *
 * kernel 那一半（建立、不變式 ①、明確套用、連帶刪除、推導值）在
 * `packages/schema/src/commands/subscenes.test.ts` 與 `subscenes.test.ts`；這裡測的是
 * 手勢怎麼接上它：`/insert`／`/continue-to` 的兩步、`/back-to`、雙 Enter、折返標記、
 * 子場次號、時間下拉的排法、刪除選單與 ⌘Z。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { mintLocationId, mintSceneId, schema as k } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { allSceneIds } from "./address";
import { EntityCatalogProvider } from "./entity-catalog";
import { deleteSceneLabel } from "./scene-menu";
import { useScreenplayEditor } from "./use-screenplay-editor";

const living = { locationId: mintLocationId(), displayName: "公寓客廳" };
const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const sub = (kind: string, blocks: PMNode[], attrs: Record<string, unknown> = {}) =>
  k.node("subscene", { sceneId: mintSceneId(), kind, ...attrs }, blocks);
const scene = (blocks: PMNode[], attrs: Record<string, unknown> = {}) =>
  k.node("scene", { sceneId: mintSceneId(), ...attrs }, blocks);
const docOf = (...scenes: PMNode[]) => k.node("doc", null, scenes).toJSON() as object;

function Harness({ content, onEditor }: { content: object; onEditor: (e: Editor) => void }) {
  const editor = useScreenplayEditor(content, "documentEnd");
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return (
    <EntityCatalogProvider>
      <EditorContent editor={editor} />
    </EntityCatalogProvider>
  );
}

async function mount(content: object) {
  let editor: Editor | null = null;
  const view = render(<Harness content={content} onEditor={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).not.toBeNull());
  await waitFor(() => expect(view.container.querySelector(".scene")).not.toBeNull());
  // 等建立時的焦點落定：Tiptap 在 setTimeout 裡發 `create`，`onCreate`（documentEnd）的
  // `focus("end")` 又延到下一個 animation frame。不等的話，那一幀可能落在測試按鍵之後，把焦點
  // 從 chip 搶回編輯器（2026-10-20 main CI 的 flake）。
  await waitFor(() => expect(editor!.isInitialized).toBe(true));
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  return { editor: editor!, container: view.container };
}

/** 游標放到第 `n` 個 textblock 的末端（依文件順序，0 起算）。 */
function caretAtEndOfBlock(editor: Editor, n: number) {
  let seen = -1;
  let at: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (at != null) return false;
    if (!node.isTextblock) return true;
    seen += 1;
    if (seen === n) at = pos + 1 + node.content.size;
    return false;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at!)));
}

/** 打一段指令（Suggestion 的 items／render 走 promise，等一個 macrotask）。 */
async function type(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.insertContent(text);
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function press(editor: Editor, key: string) {
  await act(async () => {
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** 主場次的孩子型別序列。 */
const kidsOf = (editor: Editor, sceneIndex = 0) => {
  const out: string[] = [];
  editor.state.doc.child(sceneIndex).forEach((n) => out.push(n.type.name));
  return out;
};

afterEach(() => cleanup());

describe("/insert、/continue-to：兩步建立帶種類的子場次", () => {
  it("第一步選「插入戲」、第二步第一項是「不沿用，留空」→ 建立種類＝插入、metadata 全空的子場次", async () => {
    const { editor, container } = await mount(
      docOf(scene([action("客廳裡。"), action()], { location: living, time: "夜", intExt: "內景" })),
    );
    caretAtEndOfBlock(editor, 1);
    await type(editor, "/insert");
    await press(editor, "Enter"); // 第一步：插入戲 → 換成第二步清單
    expect(kidsOf(editor)).toEqual(["action", "action"]); // 還沒建立任何東西
    await press(editor, "Enter"); // 第二步第一項：不沿用，留空

    // 承載指令的那一行收掉了，子場次接在「客廳裡。」之後。
    expect(kidsOf(editor)).toEqual(["action", "subscene"]);
    const created = editor.state.doc.child(0).child(1);
    expect(created.attrs.kind).toBe("插入");
    expect(created.attrs.time).toBeNull();
    expect(created.attrs.location).toBeNull();
    expect(editor.state.doc.textContent).not.toContain("/insert");

    // 子場次號 1.1 畫在它的 gutter 上 —— 時空還空著，但剛新增、編劇還在它身上，畫面上先是正式號
    // （離開時才判定，票券 14）；種類標籤用 `/` 選單的用詞。
    await waitFor(() =>
      expect([...container.querySelectorAll(".scene__number")].map((n) => n.textContent)).toEqual([
        "1",
        "1.1",
      ]),
    );
    expect(container.querySelector(".scene--sub .scene__kind")?.textContent).toBe("插入戲");
  });

  it("第二步選一個既有場次 → 套用它的內外／時間／地點，不套用登場人物", async () => {
    const who = [{ characterId: "ch_x", displayName: "小明" }];
    const { editor } = await mount(
      docOf(
        scene([action("客廳裡。"), action()], {
          location: living,
          time: "夜",
          intExt: "內景",
          appearingCharacters: who,
        }),
      ),
    );
    caretAtEndOfBlock(editor, 1);
    await type(editor, "/continue-to");
    await press(editor, "Enter"); // 接續到…
    await press(editor, "ArrowDown"); // 跳過「不沿用，留空」
    await press(editor, "Enter"); // 「1 內景 公寓客廳 夜」那一列

    const created = editor.state.doc.child(0).child(1);
    expect(created.type.name).toBe("subscene");
    expect(created.attrs.kind).toBe("接續");
    expect(created.attrs).toMatchObject({ time: "夜", intExt: "內景", location: living });
    expect(created.attrs.appearingCharacters).toBeNull();
    expect(kidsOf(editor)).toEqual(["action", "subscene"]);
  });

  it("空場次裡 /insert、/continue-to 不在選單上（不變式 ①）—— Enter 落在「新增下一場」", async () => {
    const { editor } = await mount(docOf(scene([action()])));
    caretAtEndOfBlock(editor, 0);
    await type(editor, "/in");
    await press(editor, "Enter");
    // 「in」不匹配任何可用的列 → 選單沒有東西可選，什麼都沒建立。
    expect(editor.state.doc.child(0).childCount).toBe(1);
    expect(allSceneIds(editor.state.doc)).toHaveLength(1);
  });

  it("在子場次裡按 /insert ＝ 建立兄弟，接在這個子場次之後（語意不變）", async () => {
    const first = sub("接續", [action("陽台。"), action()]);
    const { editor } = await mount(docOf(scene([action("客廳。"), first, action("回來。")])));
    caretAtEndOfBlock(editor, 2); // 子場次裡那個空行
    await type(editor, "/insert");
    await press(editor, "Enter");
    await press(editor, "Enter");

    expect(kidsOf(editor)).toEqual(["action", "subscene", "subscene", "action"]);
    expect(editor.state.doc.child(0).child(1).attrs.sceneId).toBe(first.attrs.sceneId);
    expect(editor.state.doc.child(0).child(1).childCount).toBe(1); // 承載指令的空行收掉，不切開它
    expect(editor.state.doc.child(0).child(2).attrs.kind).toBe("插入");
  });
});

describe("/back-to 與雙 Enter：走出子場次，不建立任何東西", () => {
  const base = () => docOf(scene([action("客廳。"), sub("接續", [action("陽台。"), action()])], { location: living }));

  it("/back-to 只在子場次裡出現，標籤是主場次的地點；游標回到主場次、沒有新身分", async () => {
    const { editor } = await mount(base());
    const before = allSceneIds(editor.state.doc);
    caretAtEndOfBlock(editor, 2); // 子場次最後那個空行
    await type(editor, "/back");
    await press(editor, "Enter");

    expect(allSceneIds(editor.state.doc)).toEqual(before);
    expect(kidsOf(editor)).toEqual(["action", "subscene", "action"]);
    expect(editor.state.doc.child(0).child(1).childCount).toBe(1); // 空行被提升出去了
    const { $from } = editor.state.selection;
    expect($from.node($from.depth - 1).type.name).toBe("scene");
  });

  it("雙 Enter：子場次末尾的空動作區塊按 Enter ＝ 提升出去", async () => {
    const { editor } = await mount(base());
    caretAtEndOfBlock(editor, 2);
    await press(editor, "Enter");
    expect(kidsOf(editor)).toEqual(["action", "subscene", "action"]);
    const { $from } = editor.state.selection;
    expect($from.node($from.depth - 1).type.name).toBe("scene");
  });

  it("子場次唯一的空區塊按 Enter 不會掏空它（照常多開一行）", async () => {
    const { editor } = await mount(docOf(scene([action("客廳。"), sub("插入", [action()])])));
    caretAtEndOfBlock(editor, 1);
    await press(editor, "Enter");
    expect(editor.state.doc.child(0).child(1).childCount).toBe(2);
  });

  it("主場次裡沒有 /back-to", async () => {
    const { editor } = await mount(docOf(scene([action("客廳。"), action()])));
    caretAtEndOfBlock(editor, 1);
    await type(editor, "/back");
    await press(editor, "Enter");
    expect(kidsOf(editor)).toEqual(["action", "action"]);
  });
});

describe("折返標記：編輯器即時顯示，不進資料模型", () => {
  it("回到主場次的非空內容 → 印「回到 公寓客廳」；空行不印", async () => {
    const { editor, container } = await mount(
      docOf(scene([action("客廳。"), sub("接續", [action("陽台。")]), action()], { location: living })),
    );
    expect(container.querySelector(".return-marker")).toBeNull();

    caretAtEndOfBlock(editor, 2);
    await type(editor, "他走回來。");
    await waitFor(() =>
      expect(container.querySelector(".return-marker")?.textContent).toBe("回到\u3000公寓客廳"),
    );
    expect(JSON.stringify(editor.getJSON())).not.toContain("回到");
  });

  it("兩個子場次相鄰時不印", async () => {
    const { container } = await mount(
      docOf(
        scene([action("客廳。"), sub("接續", [action("陽台。")]), sub("接續", [action("廚房。")])], {
          location: living,
        }),
      ),
    );
    expect(container.querySelector(".return-marker")).toBeNull();
  });
});

describe("子場次的時間下拉依種類排序", () => {
  const openTime = async (container: HTMLElement) => {
    const trigger = container.querySelector<HTMLButtonElement>(
      '.scene--sub .scene__chip-control[aria-label="時間"]',
    )!;
    fireEvent.click(trigger);
    return [...container.querySelectorAll(".scene--sub .chip-select__menu li")].map((li) => li.textContent);
  };

  it("接續：主場次的值置頂並標「（原場次）」，欄位仍然是空的", async () => {
    const { container } = await mount(
      docOf(scene([action("客廳。"), sub("接續", [action("陽台。")])], { time: "夜" })),
    );
    const rows = await openTime(container);
    expect(rows[0]).toBe("待定");
    expect(rows[1]).toBe("夜(n)（原場次）");
    expect(container.querySelector('.scene--sub [aria-label="時間"]')?.textContent).toBe("時間");
  });

  it("插入：只標注，不置頂", async () => {
    const { container } = await mount(
      docOf(scene([action("客廳。"), sub("插入", [action("夢。")])], { time: "夜" })),
    );
    const rows = await openTime(container);
    expect(rows.slice(1)).toEqual(["日(d)", "夜(n)（原場次）", "晨(d)", "昏(d)"]);
  });
});

describe("刪除主場次一併刪子場次，⌘Z 一步還原", () => {
  it("SceneMenu 標數量；刪掉之後 ⌘Z 一步把子樹與 sceneId 一起帶回來", async () => {
    const content = docOf(
      scene([action("客廳。"), sub("接續", [action("陽台。")]), sub("插入", [action("夢。")])]),
      scene([action("下一場。")]),
    );
    const { editor, container } = await mount(content);
    const before = editor.getJSON();

    const number = container.querySelector(".scene__number")!;
    fireEvent.click(number);
    // 刪除排最後（前面是草稿標記那一列，票券 14）。
    const item = await waitFor(() => {
      const el = container.querySelector(".scene-menu button:last-child");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(item.textContent).toBe("刪除本場（含 2 個子場次）");
    await act(async () => {
      fireEvent.mouseDown(item);
    });

    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.textContent).toBe("下一場。");

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("標籤的三種字", () => {
    expect(deleteSceneLabel(false, 0)).toBe("刪除本場");
    expect(deleteSceneLabel(false, 2)).toBe("刪除本場（含 2 個子場次）");
    expect(deleteSceneLabel(true, 0)).toBe("刪除這個子場次");
  });
});

describe("方向鍵走得進子場次的 chip row", () => {
  it("主場次區塊末端按 ↓，下面接的是子場次 → 落在子場次 chip row 的第一格", async () => {
    const { editor, container } = await mount(
      docOf(scene([action("客廳。"), sub("接續", [action("陽台。")])])),
    );
    caretAtEndOfBlock(editor, 0);
    editor.view.focus();
    await press(editor, "ArrowDown");
    const first = container.querySelector(".scene--sub .scene__chip-control");
    expect(document.activeElement).toBe(first);
  });
});
