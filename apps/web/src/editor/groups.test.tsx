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
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  mintGroupId,
  mintLocationId,
  mintSceneId,
  projectScenes,
  schema as k,
} from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { allSceneIds } from "./address";
import { EntityCatalogProvider } from "./entity-catalog";
import { SlashMenu } from "./extensions/slash";
import { PointMenu } from "./point-menu";
import { useScreenplayEditor } from "./use-screenplay-editor";

const room = { locationId: mintLocationId(), displayName: "警局偵訊室" };
const dock = { locationId: mintLocationId(), displayName: "港邊倉庫" };
/** 時間與內外 —— 再配一個地點就填完了，不是草稿（票券 14）。 */
const when = { time: "夜", intExt: "內景" };
const elsewhere = () => ({ ...when, location: { locationId: mintLocationId(), displayName: "走廊" } });
const action = (text = "") => k.node("action", null, text ? [k.text(text)] : []);
const dialogue = (text: string) => k.node("dialogue", { character: null }, [k.text(text)]);
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
      <PointMenu />
      <SlashMenu />
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
    const here = scene([action("若晴把照片推到桌子中央。"), action()], { ...when, location: room });
    const { editor, container } = await mount(docOf(scene([action("前一場")], elsewhere()), here));
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
      // 新成員的時空還空著，但焦點在它身上：畫面上先是正式號（離開時才判定，票券 14）。
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

describe("片段左側的標籤", () => {
  it("成員是草稿時印「草稿」，標籤滑過才看得到 —— 同場次的 gutter（票券 16）", async () => {
    const a = member({ ...when, location: room });
    const b = member({ ...when, location: dock, manualDraft: true });
    const { container } = await mount(
      docOf(group([a, b], [fragment(a, [action("甲打電話")]), fragment(b, [action("乙接電話")])])),
    );
    const nos = () => [...container.querySelectorAll(".group-fragment__no")];
    await waitFor(() => expect(nos().map((n) => n.textContent)).toEqual(["1", "草稿"]));
    expect(nos()[1]!.getAttribute("title")).toBe("S1[D1]");
    expect(nos()[0]!.hasAttribute("title")).toBe(false);
    expect(container.querySelectorAll(".group-fragment--draft")).toHaveLength(1);
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

  it("游標在成員的子場次裡：⌘+N 是無效鍵（片段不能從子場次切開）", async () => {
    const a = member({ location: room });
    const b = member({ location: dock });
    const sub = k.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, [action("閃回")]);
    const { editor } = await mount(docOf(group([a, b], [fragment(a, [action("偵訊室。"), sub])])));
    caretAtEndOfBlock(editor, 1);
    const before = editor.state.doc.toJSON();
    await press(editor, "2", mod);
    expect(editor.state.doc.toJSON()).toEqual(before);
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
    const a = member({ ...when, location: room });
    const b = member({ ...when, location: dock });
    const g = group([a, b], [fragment(a, [action("偵訊室。")]), fragment(b, [action("倉庫。")])]);
    return { a, b, content: docOf(scene([action("前一場")], elsewhere()), g) };
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
    expect(projectScenes(editor.state.doc).map((s) => s.label)).toEqual(["1", "2", "3", "S3[D1]"]); // 新場次時空還空著 → 草稿
  });
});

describe("⌘+A 在片段裡：區塊 → 片段內文 → 整個群組 → 整份", () => {
  it("每一步畫面上都看得到；已經是整份時再按就停在整份，不對 doc 建 TextSelection", async () => {
    const a = member({ location: room });
    const b = member({ location: dock });
    const g = group([a, b], [fragment(a, [action("偵訊室。"), action("若晴不說話。")]), fragment(b, [action("倉庫。")])]);
    const { editor, container } = await mount(docOf(g, scene([action("後一場")])));
    caretAtEndOfBlock(editor, 0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await press(editor, "a", mod);
    expect(editor.state.selection.$from.parent.textContent).toBe("偵訊室。");
    await press(editor, "a", mod);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe(
      "偵訊室。若晴不說話。",
    );
    await press(editor, "a", mod);
    const sel = editor.state.selection;
    expect(sel instanceof NodeSelection && sel.node.type.name).toBe("sceneGroup");
    await waitFor(() => expect(container.querySelector(".scene-group")?.classList).toContain("is-node-selected"));
    await press(editor, "a", mod);
    expect(editor.state.selection instanceof AllSelection).toBe(true);
    await press(editor, "a", mod);
    expect(editor.state.selection instanceof AllSelection).toBe(true);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("成員選單：離開對剪", () => {
  const threeWay = () => {
    const a = member({ location: room });
    const b = member({ location: dock });
    const c = member();
    const g = group(
      [a, b, c],
      [fragment(a, [action("A1")]), fragment(b, [action("B1")]), fragment(c, [action("C1")]), fragment(b, [action("B2")])],
    );
    return { a, b, c, content: docOf(g) };
  };

  async function pickMenuRow(container: HTMLElement, memberIndex: number, label: RegExp) {
    fireEvent.click(container.querySelectorAll(".scene--member .scene__number")[memberIndex]!);
    const row = await waitFor(() => {
      const el = [...container.querySelectorAll(".scene-menu button")].find((b) => label.test(b.textContent ?? ""));
      expect(el).toBeDefined();
      return el!;
    });
    await act(async () => {
      fireEvent.mouseDown(row);
    });
  }

  it("移出對剪：那一場接在群組後面、片段接成一段；⌘Z 一步回來", async () => {
    const { a, b, c, content } = threeWay();
    const { editor, container } = await mount(content);
    const before = editor.getJSON();
    await pickMenuRow(container, 1, /^移出對剪/);

    expect(editor.state.doc.childCount).toBe(2);
    expect(shapeOf(editor.state.doc.child(0)).members).toEqual([a.attrs.sceneId, c.attrs.sceneId]);
    const out = editor.state.doc.child(1);
    expect([out.type.name, out.attrs.sceneId, out.textContent]).toEqual(["scene", b.attrs.sceneId, "B1B2"]);

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("解散對剪：每個成員都變回普通場次", async () => {
    const { a, b, c, content } = threeWay();
    const { editor, container } = await mount(content);
    await pickMenuRow(container, 0, /^解散對剪/);
    const tops: [string, unknown, string][] = [];
    editor.state.doc.forEach((n) => tops.push([n.type.name, n.attrs.sceneId, n.textContent]));
    expect(tops).toEqual([
      ["scene", a.attrs.sceneId, "A1"],
      ["scene", b.attrs.sceneId, "B1B2"],
      ["scene", c.attrs.sceneId, "C1"],
    ]);
  });
});

describe("「對剪到…」第二步", () => {
  it("同地點、同時間的場次不列；打字篩第二步，不會退回第一步", async () => {
    const here = scene([action("河堤。"), action()], { location: room, time: "夜" });
    const twin = scene([action("也是河堤。")], { location: room, time: "夜" });
    const far = scene([action("倉庫。")], { location: dock, time: "夜" });
    const near = scene([action("白天的偵訊室。")], { location: room, time: "日" });
    const { editor, container } = await mount(docOf(here, twin, far, near));
    caretAtEndOfBlock(editor, 1);
    await type(editor, "/intercut");
    await press(editor, "Enter");

    const rows = () => [...container.querySelectorAll(".slash-menu button strong")].map((n) => n.textContent);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows()[0]).toBe("建立新的一場");
    expect(rows().some((r) => r?.includes("港邊倉庫"))).toBe(true);
    expect(rows().filter((r) => r?.includes("警局偵訊室"))).toHaveLength(1); // 只有白天那一場

    await type(editor, "港邊");
    await waitFor(() => expect(rows()).toEqual([expect.stringContaining("港邊倉庫")]));
    await press(editor, "Enter");

    expect(editor.state.doc.child(0).type.name).toBe("sceneGroup");
    expect(shapeOf(editor.state.doc.child(0)).members).toEqual([here.attrs.sceneId, far.attrs.sceneId]);
    expect(editor.state.doc.textContent).not.toContain("港邊");
  });
});

describe("片段第一句對白的人物欄往上／往左（票券 61）", () => {
  const dialogue = (text: string) => k.node("dialogue", { character: null }, [k.text(text)]);
  const speakerIn = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>(".block__speaker")!;
  const extrasInputs = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLInputElement>(".scene__chip--extras input"),
  ];

  it.each(["ArrowLeft", "ArrowUp"])(
    "第二段片段：%s 回**上一段片段的末端**，不是飛到 chip row 那幾排",
    async (key) => {
      const a = member({ ...when, location: room });
      const b = member({ ...when, location: dock });
      const { editor, container } = await mount(
        docOf(group([a, b], [fragment(a, [action("偵訊室。")]), fragment(b, [dialogue("你在哪？")])])),
      );

      const speaker = speakerIn(container);
      speaker.focus();
      fireEvent.keyDown(speaker, { key });

      await waitFor(() => {
        const { $from, empty } = editor.state.selection;
        expect(empty).toBe(true);
        expect($from.parent.textContent).toBe("偵訊室。");
        expect($from.parentOffset).toBe("偵訊室。".length);
      });
    },
  );

  it.each(["ArrowLeft", "ArrowUp"])(
    "第一段片段：%s 進**最後一個成員**的群演欄（緊貼在片段上面那一排），不管這段歸誰",
    async (key) => {
      const a = member({ ...when, location: room });
      const b = member({ ...when, location: dock });
      const { container } = await mount(docOf(group([a, b], [fragment(a, [dialogue("說吧。")])])));

      const speaker = speakerIn(container);
      speaker.focus();
      fireEvent.keyDown(speaker, { key });

      const extras = extrasInputs(container);
      expect(extras).toHaveLength(2);
      await waitFor(() => expect(document.activeElement).toBe(extras[1]));
    },
  );
});

// 成員的 chip row 全疊在片段之前（截圖：成員 1、成員 2 兩排，下面才是「以下對剪」）。方向鍵照**畫面上下**
// 走，不照「這一排歸誰的片段」—— 驗收回饋 2026-10-27（票券 61）：成員 2 群演欄按 ↓ 跳過了第 1 段片段。
describe("成員的 chip row 照畫面上下走", () => {
  const extrasOf = (container: HTMLElement, i: number) =>
    container.querySelectorAll<HTMLInputElement>(".scene__chip--extras input")[i]!;
  const intExtOf = (container: HTMLElement, i: number) =>
    container.querySelectorAll<HTMLElement>('.scene__chips [aria-label="內外"]')[i]!;

  async function mountPair() {
    const a = member({ ...when, location: room });
    const b = member({ ...when, location: dock });
    return mount(
      docOf(group([a, b], [fragment(a, [action("我是敘述。")]), fragment(b, [action("另一段。")])])),
    );
  }

  const caretAtStartOf = (editor: Editor, text: string) => {
    const { $from, empty } = editor.state.selection;
    return empty && $from.parent.textContent === text && $from.parentOffset === 0;
  };

  it.each(["ArrowDown", "ArrowRight", "Enter"])(
    "最後一個成員的群演欄按 %s → 第 1 段片段的開頭（緊貼在下面那一段，不管它歸誰）",
    async (key) => {
      const { editor, container } = await mountPair();
      const extras = extrasOf(container, 1);
      extras.focus();
      fireEvent.keyDown(extras, { key });
      await waitFor(() => expect(caretAtStartOf(editor, "我是敘述。")).toBe(true));
    },
  );

  it.each(["ArrowDown", "ArrowRight", "Enter"])(
    "前面成員的群演欄按 %s → 下一個成員那一排的第一格（內外）",
    async (key) => {
      const { container } = await mountPair();
      const extras = extrasOf(container, 0);
      extras.focus();
      fireEvent.keyDown(extras, { key });
      await waitFor(() => expect(document.activeElement).toBe(intExtOf(container, 1)));
    },
  );

  it.each(["ArrowUp", "ArrowLeft"])(
    "反向：第二個成員的內外格按 %s → 上一個成員的群演欄（不是跳出群組）",
    async (key) => {
      const { container } = await mountPair();
      const intExt = intExtOf(container, 1);
      intExt.focus();
      fireEvent.keyDown(intExt, { key });
      await waitFor(() => expect(document.activeElement).toBe(extrasOf(container, 0)));
    },
  );

  // 票券 89：第 1 段片段第一句是對白 → 先停它的人物欄（不管那一段歸誰）。
  it("最後一個成員的群演欄按 ↓，第 1 段片段第一句是對白 → 它的人物欄", async () => {
    const a = member({ ...when, location: room });
    const b = member({ ...when, location: dock });
    const { container } = await mount(
      docOf(group([a, b], [fragment(a, [dialogue("你來了。")]), fragment(b, [action("另一段。")])])),
    );
    const extras = extrasOf(container, 1);
    extras.focus();
    fireEvent.keyDown(extras, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector(".block__speaker")),
    );
  });

  it("片段末端按 →，下一段片段第一句是對白 → 它的人物欄", async () => {
    const a = member({ ...when, location: room });
    const b = member({ ...when, location: dock });
    const { editor, container } = await mount(
      docOf(group([a, b], [fragment(a, [action("我是敘述。")]), fragment(b, [dialogue("你來了。")])])),
    );
    caretAtEndOfBlock(editor, 0);
    editor.view.dom.focus();
    await press(editor, "ArrowRight");
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector(".block__speaker")),
    );
  });

  // 成員的子場次是最後一段片段的最後一個孩子：下面是群組之後那一場的 chip row，不是它的內文。
  it("最後一段片段裡的子場次末端按 ↓ → 下一場 chip row 的第一格，不越過它進對白", async () => {
    const a = member({ ...when, location: room });
    const sub = k.node("subscene", { sceneId: mintSceneId(), kind: "插入" }, [action("閃回")]);
    const { editor, container } = await mount(
      docOf(group([a], [fragment(a, [action("我是敘述。"), sub])]), scene([dialogue("你來了。")])),
    );
    caretAtEndOfBlock(editor, 1);
    editor.view.dom.focus();
    await press(editor, "ArrowDown");
    const nextScene = [...container.querySelectorAll<HTMLElement>(".scene")].at(-1)!;
    await waitFor(() =>
      expect(document.activeElement).toBe(nextScene.querySelector('.scene__chips [aria-label="內外"]')),
    );
  });

  it("⌘↓ 從任一個成員都是直接進內文 —— 第 1 段片段的開頭", async () => {
    const { editor, container } = await mountPair();
    const extras = extrasOf(container, 0);
    extras.focus();
    fireEvent.keyDown(extras, { key: "ArrowDown", ...mod });
    await waitFor(() => expect(caretAtStartOf(editor, "我是敘述。")).toBe(true));
  });
});
