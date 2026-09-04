/**
 * 「新增下一場」—— `/next`、⌘+Enter、場次腳部按鈕三個入口共用一條路徑（§7.1、§7.2）。
 *
 * 文件是 `scene*`，場次之外沒有可編輯的空間，「建立容器」的語意消失，剩下的只有序列動作：
 * 在當前這場後面再開一場。意圖就是 kernel 的 `createNextScene` command。
 *
 * ⚠️ 用滑鼠點的入口（腳部按鈕）**必須自己傳 `afterSceneId`** —— 游標可能還在別的場次裡，
 * 靠 selection 推算會插錯位置。快捷鍵／slash 才靠游標所在場次。
 */
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

import { createNextScene } from "@scenephonie/schema";

import { sceneContext } from "../address";
import { runKernelCommand } from "../command-bridge";

/** 游標所在的頂層場次 id；不在任何場次裡回 `null`（→ 接在全劇最後一場之後）。 */
export function currentSceneId(editor: Editor): string | null {
  return sceneContext(editor.state.selection.$from)?.sceneId ?? null;
}

export function requestNextScene(editor: Editor, afterSceneId?: string | null): boolean {
  // 只有「沒傳」才靠游標推算。傳進來的 `null` 是有意義的答案（「接在全劇最後一場之後」，
  // 零場次的空狀態就是這樣叫的）—— 用 `??` 會把它跟沒傳混為一談，又掉回靠 selection 推算。
  const after = afterSceneId === undefined ? currentSceneId(editor) : afterSceneId;
  return runKernelCommand(editor, (doc) => createNextScene(doc, { afterSceneId: after }), {
    focusNewSceneMeta: true,
  });
}

export const NextScene = Extension.create({
  name: "nextScene",
  addKeyboardShortcuts() {
    // Mod-Enter：hardBreak 已在 StarterKit 關掉，這顆鍵空出來給「新增下一場」。
    return { "Mod-Enter": () => requestNextScene(this.editor) };
  },
});
