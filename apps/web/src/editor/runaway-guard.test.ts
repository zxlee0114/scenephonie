// @vitest-environment jsdom
/**
 * 斷路器的判斷（`createRunawayMonitor`）—— jsdom 重現不了 DevTools 下的卡死本身，這裡鎖的是
 * 「什麼時候跳閘、跳閘時記下什麼」。
 */
import { Editor } from "@tiptap/core";
import { mintSceneId, schema as k } from "@scenephonie/schema";
import { afterEach, describe, expect, it } from "vitest";

import { createRunawayMonitor } from "./extensions/runaway-guard";
import { Action, Dialogue, Doc, GroupFragment, GroupMember, InsertShot, Scene, SceneGroup, Subscene } from "./schema";
import { baseStarterKit } from "./starter-kit";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function setup() {
  const scene = k.node("scene", { sceneId: mintSceneId() }, [k.node("action", null, [k.text("x")])]);
  editor = new Editor({
    extensions: [baseStarterKit(), Doc, Scene, Subscene, SceneGroup, GroupMember, GroupFragment, Action, Dialogue, InsertShot],
    content: k.node("doc", null, [scene]).toJSON(),
  });
  let t = 0;
  const monitor = createRunawayMonitor(() => t);
  return { view: editor.view, monitor, advance: (ms: number) => (t += ms) };
}

describe("失控重繪的斷路器", () => {
  it("沒有輸入、一秒內重繪超過上限 → 跳閘一次，記下輸入與游標路徑", () => {
    const { view, monitor, advance } = setup();
    monitor.input("keydown", new KeyboardEvent("keydown", { key: "Enter" }));
    advance(1000);
    let record = null;
    for (let i = 0; i < 400 && !record; i++) {
      advance(1);
      record = monitor.update(view);
    }
    expect(record).not.toBeNull();
    expect(record!.inputs.map((i) => i.key)).toEqual(["Enter"]);
    expect(record!.selectionPath).toMatch(/^doc > scene > /);
    expect(monitor.tripped).toBe(true);
    expect(monitor.update(view)).toBeNull(); // 只跳一次
  });

  it("使用者一直在輸入（按住鍵連打）不算失控", () => {
    const { view, monitor, advance } = setup();
    for (let i = 0; i < 400; i++) {
      advance(1);
      monitor.input("keydown");
      expect(monitor.update(view)).toBeNull();
    }
  });

  it("重繪分散在超過一秒的時間裡不算失控", () => {
    const { view, monitor, advance } = setup();
    for (let i = 0; i < 1000; i++) {
      advance(5);
      expect(monitor.update(view)).toBeNull();
    }
  });

  it("沒有 transaction 的重繪（DOM 讀回後的強制重繪）一秒超過 30 次就跳閘，並帶著最近的 DOM 變動", () => {
    const { view, monitor, advance } = setup();
    const target = document.createElement("div");
    target.className = "scene scene--member";
    monitor.mutations([
      {
        type: "childList",
        target,
        attributeName: null,
        addedNodes: [document.createElement("span")] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
      } as unknown as MutationRecord,
    ]);
    advance(1000);
    let record = null;
    for (let i = 0; i < 40 && !record; i++) {
      advance(10);
      record = monitor.update(view, true);
    }
    expect(record).not.toBeNull();
    expect(record!.redrawsInWindow).toBe(31);
    expect(record!.mutations[0]).toMatchObject({ type: "childList", target: "div.scene.scene--member", added: ["span"] });
  });

  it("有 transaction 的一般重繪不算進那 30 次", () => {
    const { view, monitor, advance } = setup();
    for (let i = 0; i < 100; i++) {
      advance(5);
      expect(monitor.update(view, false)).toBeNull();
    }
  });
});
