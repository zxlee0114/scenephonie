// @vitest-environment jsdom
/**
 * 場次群組的手勢與畫面（票券 12）—— 用真的編輯器組裝（`useScreenplayEditor`）跑。
 *
 * kernel 那一半（建立、收編、切開與合併、刪成員、編號、不變式 ③、groupId 去重）在
 * `packages/schema/src/commands/groups.test.ts` 與 `groups.test.ts`；這裡測的是手勢怎麼接上它：
 * `/` →「對剪到…」的兩步、`⌘+1`／`⌘+2`／`⌘+3`、無效鍵、片段裡的 Tab 與 `/next`。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  mintGroupId,
  mintLocationId,
  mintSceneId,
  projectScenes,
  schema as k,
} from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { allSceneIds } from "./address";
import { EntityCatalogProvider } from "./entity-catalog";
import { useScreenplayEditor } from "./use-screenplay-editor";

const room = { locationId: mintLocationId(), displayName: "警局偵訊室" };
const dock = { locationId: mintLocationId(), displayName: "港邊倉庫" };
const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const scene = (blocks: PMNode[], attrs: Record<string, unknown> = {}) =>
  k.node("scene", { sceneId: mintSceneId(), ...attrs }, blocks);
const member = (attrs: Record<string, unknown> = {}) =>
  k.node("groupMember", { sceneId: mintSceneId(), ...attrs });
const fragment = (m: PMNode, blocks: PMNode[]) =>
  k.node("groupFragment", { memberId: m.attrs.sceneId as string }, blocks);
const group = (members: PMNode[], fragments: PMNode[]) =>
  k.node("sceneGroup", { groupId: mintGroupId() }, [...members, ...fragments]);
const docOf = (...tops: PMNode[]) => k.node("doc", null, tops).toJSON() as object;

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
  // 等建立時的焦點落定（見 subscenes.test.tsx 的 mount）。
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

async function type(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.insertContent(text);
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function press(editor: Editor, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** `Mod` 在 macOS 是 ⌘、其他平台是 Ctrl（Tiptap 依 `navigator.platform` 判斷）。 */
const mod: KeyboardEventInit = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
  ? { metaKey: true }
  : { ctrlKey: true };

/** 群組的形狀：成員 id 清單、片段（歸屬 → 內文）清單。 */
function shapeOf(node: PMNode) {
  const members: string[] = [];
  const fragments: [string, string][] = [];
  node.forEach((c) => {
    if (c.type.name === "groupMember") members.push(c.attrs.sceneId as string);
    else fragments.push([c.attrs.memberId as string, c.textContent]);
  });
  return { members, fragments };
}

afterEach(() => cleanup());

describe("/ →「對剪到…」：兩步建立群組", () => {
  it("建立新的一場：目前場次變成員 1、內容變片段 1；新成員的 chip row 拿到焦點，各佔一個頂層號", async () => {
    const here = scene([action("若晴把照片推到桌子中央。"), action()], { location: room });
    const { editor, container } = await mount(docOf(scene([action("前一場")]), here));
    caretAtEndOfBlock(editor, 2);
    await type(editor, "/intercut");
    await press(editor, "Enter"); // 第一步：對剪到… → 換成第二步清單
    expect(editor.state.doc.child(1).type.name).toBe("scene"); // 還沒建立任何東西
    await press(editor, "Enter"); // 第二步第一項：建立新的一場

    const g = editor.state.doc.child(1);
    expect(g.type.name).toBe("sceneGroup");
    const { members, fragments } = shapeOf(g);
    expect(members[0]).toBe(here.attrs.sceneId);
    // 承載指令的空行收掉了；新成員有一段空的片段等著寫。
    expect(fragments).toEqual([
      [here.attrs.sceneId, "若晴把照片推到桌子中央。"],
      [members[1], ""],
    ]);
    expect(editor.state.doc.textContent).not.toContain("/intercut");

    await waitFor(() =>
      expect([...container.querySelectorAll(".scene__number")].map((n) => n.textContent)).toEqual([
        "1",
        "2",
        "3",
      ]),
    );
    // 「以下對剪」是 decoration：畫面上有，doc 裡沒有。
    expect(container.querySelector(".intercut-marker")?.textContent).toBe("以下對剪");
    expect(JSON.stringify(editor.getJSON())).not.toContain("以下對剪");
    // 片段左側的常駐標籤印它的成員。
    const labels = [...container.querySelectorAll(".group-fragment__label")].map((n) => [
      n.querySelector(".group-fragment__no")?.textContent,
      n.querySelector(".group-fragment__where")?.textContent,
    ]);
    expect(labels).toEqual([
      ["2", "警局偵訊室"],
      ["3", "地點未填"],
    ]);
    // 新成員的第一格（內外）拿到焦點 —— 先填時空，同 `/next`。
    await waitFor(() =>
      expect(document.activeElement?.closest(".scene--member")).toBe(
        container.querySelectorAll(".scene--member")[1],
      ),
    );
  });

  it("選既有場次：收編它（id 不變），游標送進它那一段的開頭", async () => {
    const here = scene([action("偵訊室。"), action()], { location: room });
    const there = scene([action("倉庫。")], { location: dock, time: "夜" });
    const { editor } = await mount(docOf(here, there));
    const before = allSceneIds(editor.state.doc);
    caretAtEndOfBlock(editor, 1);
    await type(editor, "/intercut");
    await press(editor, "Enter");
    await press(editor, "ArrowDown"); // 跳過「建立新的一場」
    await press(editor, "Enter"); // 「2 港邊倉庫 夜」那一列

    expect(editor.state.doc.childCount).toBe(1);
    expect(shapeOf(editor.state.doc.child(0))).toEqual({
      members: [here.attrs.sceneId, there.attrs.sceneId],
      fragments: [
        [here.attrs.sceneId, "偵訊室。"],
        [there.attrs.sceneId, "倉庫。"],
      ],
    });
    // 沒有鑄造任何身分 —— 收編不是鑄造時刻。
    expect(new Set(allSceneIds(editor.state.doc))).toEqual(new Set(before));
    expect(editor.state.selection.$from.parent.textContent).toBe("倉庫。");
  });
});

describe("⌘+1／⌘+2／⌘+3：直接定址切換片段歸屬", () => {
  const threeWay = () => {
    const a = member({ location: room });
    const b = member({ location: dock });
    const c = member();
    return {
      a,
      b,
      c,
      content: docOf(group([a, b, c], [fragment(a, [action("若晴：你認識他嗎？"), action()])])),
    };
  };

  it("末尾剛按 Enter 開的空行按 ⌘+2：開一段新片段給成員 2，游標留在那一行", async () => {
    const { a, b, content } = threeWay();
    const { editor } = await mount(content);
    caretAtEndOfBlock(editor, 1);
    await press(editor, "2", mod);

    expect(shapeOf(editor.state.doc.child(0)).fragments).toEqual([
      [a.attrs.sceneId, "若晴：你認識他嗎？"],
      [b.attrs.sceneId, ""],
    ]);
    const { $from } = editor.state.selection;
    expect($from.node($from.depth - 1).attrs.memberId).toBe(b.attrs.sceneId);

    // 寫完倉庫那段、Enter 開新行，⌘+1 回偵訊室。
    await type(editor, "志豪屏住呼吸。");
    await act(async () => {
      editor.commands.enter();
    });
    await press(editor, "1", mod);
    expect(shapeOf(editor.state.doc.child(0)).fragments).toEqual([
      [a.attrs.sceneId, "若晴：你認識他嗎？"],
      [b.attrs.sceneId, "志豪屏住呼吸。"],
      [a.attrs.sceneId, ""],
    ]);
  });

  it("游標在片段第一行：整段改歸屬", async () => {
    const { c, content } = threeWay();
    const { editor } = await mount(content);
    caretAtEndOfBlock(editor, 0);
    await press(editor, "3", mod);
    expect(shapeOf(editor.state.doc.child(0)).fragments).toEqual([
      [c.attrs.sceneId, "若晴：你認識他嗎？"],
    ]);
  });

  it("⌘+4 在三個成員時是無效鍵：什麼都不做，不建立場次", async () => {
    const { content } = threeWay();
    const { editor } = await mount(content);
    caretAtEndOfBlock(editor, 1);
    const before = editor.state.doc.toJSON();
    const ids = allSceneIds(editor.state.doc);
    await press(editor, "4", mod);
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(allSceneIds(editor.state.doc)).toEqual(ids);
  });

  it("切回來再切走：相鄰同成員的片段自動合併，⌘Z 也不會退回到相鄰同成員的狀態", async () => {
    const { a, content } = threeWay();
    const { editor } = await mount(content);
    caretAtEndOfBlock(editor, 1);
    await press(editor, "2", mod);
    await press(editor, "1", mod); // 切回成員 1 —— 與前一段相鄰同成員，合併
    expect(shapeOf(editor.state.doc.child(0)).fragments).toEqual([
      [a.attrs.sceneId, "若晴：你認識他嗎？"],
    ]);
    await act(async () => {
      editor.commands.undo();
    });
    // 退到哪一步取決於 history 的分組；不管哪一步，都不會出現相鄰同成員的兩段。
    const members = shapeOf(editor.state.doc.child(0)).fragments.map(([m]) => m);
    expect(members.every((m, i) => i === 0 || members[i - 1] !== m)).toBe(true);
  });
});

describe("片段裡照常寫字", () => {
  const twoWay = () => {
    const a = member({ location: room });
    const b = member({ location: dock });
    const g = group([a, b], [fragment(a, [action("偵訊室。")]), fragment(b, [action("倉庫。")])]);
    return { a, b, content: docOf(scene([action("前一場")]), g) };
  };

  it("Tab 只換片段裡那個區塊的型別，不動片段的歸屬", async () => {
    const { b, content } = twoWay();
    const { editor } = await mount(content);
    caretAtEndOfBlock(editor, 2);
    await press(editor, "Tab");
    const frag = editor.state.doc.child(1).child(3);
    expect(frag.attrs.memberId).toBe(b.attrs.sceneId);
    expect(frag.child(0).type.name).toBe("dialogue");
  });

  it("/next 結束群組：新場次接在整個群組之後，不是新增成員", async () => {
    const { content } = twoWay();
    const { editor } = await mount(content);
    caretAtEndOfBlock(editor, 1);
    await press(editor, "Enter", mod);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).type.name).toBe("scene");
    expect(shapeOf(editor.state.doc.child(1)).members).toHaveLength(2);
    expect(projectScenes(editor.state.doc).map((s) => s.label)).toEqual(["1", "2", "3", "4"]);
  });
});
