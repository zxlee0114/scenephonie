// @vitest-environment jsdom
/**
 * 票券 27 —— 「新增下一場」時把該場次留在畫面中段（打字餘裕），而不是貼在視窗底緣。
 *
 * jsdom 沒有版面引擎，落點的算術由 `typewriter-scroll.test.ts` 鎖住；這支鎖的是**串接**：
 * 新場次誕生時才捲（而且只捲一次），單純掛載編輯器時不捲，且焦點串接（焦點落在新場次的
 * 內外景欄）不因為改捲動而回歸。
 */
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { render, waitFor } from "@testing-library/react";
import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestNextScene } from "./extensions/next-scene";
import { markSceneBorn } from "./scene-birth";
import { useScreenplayEditor, type InitialFocus } from "./use-screenplay-editor";

function docWithScene(sceneId = mintSceneId()) {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId }, [
        kernelSchema.node("action", null, [kernelSchema.text("第一場的動作")]),
      ]),
    ])
    .toJSON() as object;
}

/** `/next` 剛產出的形狀：metadata 全空、單一空 `action`（票券 31 的「還沒開工」）。 */
function unstartedScene(sceneId: string) {
  return kernelSchema
    .node("doc", null, [kernelSchema.node("scene", { sceneId }, [kernelSchema.node("action")])])
    .toJSON() as object;
}

function Harness({
  onEditor,
  content = docWithScene(),
  initialFocus,
}: {
  onEditor: (e: Editor) => void;
  content?: object;
  initialFocus?: InitialFocus;
}) {
  const editor = useScreenplayEditor(content, initialFocus);
  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);
  return <EditorContent editor={editor} />;
}

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(scrollTo as unknown as typeof window.scrollTo);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("新增下一場的打字餘裕", () => {
  it("只是載入編輯器時不捲動（短劇本不產生詭異的捲動）", async () => {
    const { container } = render(<Harness onEditor={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(1));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("新增下一場後把新場次捲到打字餘裕線上", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(1));

    requestNextScene(editor);

    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    const [arg] = scrollTo.mock.calls[0] as [ScrollToOptions];
    expect(typeof arg.top).toBe("number");
    expect(arg.top).toBeGreaterThanOrEqual(0);
  });

  it("焦點串接不回歸：焦點仍落在新場次的內外景欄", async () => {
    let editor!: Editor;
    const { container } = render(<Harness onEditor={(e) => (editor = e)} />);
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(1));

    requestNextScene(editor);

    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(2));
    const newScene = container.querySelectorAll(".scene")[1]!;
    const intExt = newScene.querySelector<HTMLButtonElement>(".scene__chips .scene__chip-control")!;
    await waitFor(() => expect(document.activeElement).toBe(intExt));
    expect(intExt.textContent).toBe("內外");
  });

  it("上一個 instance 留下的過期誕生登記不會讓「載入」變成「剛新增」", async () => {
    // `/next` 建完場次、SceneView 還沒掛載使用者就離開 —— `born` 活在 module 層會跟著留下來。
    // 重整回來時末場還沒開工，票券 31 會把焦點請求指向同一個 sceneId：若 `born` 沒被清掉，
    // 這條載入路徑就會領到它，重播浮現動畫並捲一次打字餘裕。
    const sceneId = mintSceneId();
    markSceneBorn(sceneId);

    const { container } = render(
      <Harness onEditor={() => {}} content={unstartedScene(sceneId)} initialFocus="documentEnd" />,
    );
    await waitFor(() => expect(container.querySelectorAll(".scene").length).toBe(1));

    expect(scrollTo).not.toHaveBeenCalled();
    expect(container.querySelector(".scene")!.classList.contains("scene--just-added")).toBe(false);
  });
});
