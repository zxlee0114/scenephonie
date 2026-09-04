/**
 * 編輯器組裝 —— 把 schema（`./schema` 的 view 綁定版）與行為擴充兜起來。
 *
 * canonical schema 的權威在 `@scenephonie/schema`；這裡的 node／extension 只是它的 view 綁定與
 * 手勢層。對外只曝露 command（寫）與 projection（讀），中間全走 command bridge（§6.3）。
 *
 * 初始 doc 一定至少有一場 —— schema 是 `scene*`（可為空），「劇本至少有一場」是編輯器的責任
 * 不是 schema 能表達的不變式（見 kernel schema.ts 註解 / §5.1）。
 */
"use client";

import { useEditor } from "@tiptap/react";

import { topLevelSceneIds } from "./command-bridge";
import { emptyScreenplay } from "./empty-screenplay";
import { claimFocus, requestFocus } from "./focus";
import { ActionNode, DialogueNode, InsertShotNode } from "./nodes/blocks";
import { SceneNode } from "./nodes/scene";
import { BlockCycle } from "./extensions/block-cycle";
import { ContinueBlock } from "./extensions/continue-block";
import { NextScene } from "./extensions/next-scene";
import { SceneIds } from "./extensions/scene-ids";
import { SceneNumbers } from "./extensions/scene-numbers";
import { SelectScope } from "./extensions/select-scope";
import { Slash } from "./extensions/slash";
import { SoftBreak } from "./extensions/soft-break";
import { VerticalNav } from "./extensions/vertical-nav";
import { Doc } from "./schema";
import { baseStarterKit } from "./starter-kit";

/**
 * 進站時游標該落在哪裡（票券 26）。
 *
 * `sceneMeta` ＝ 新建的劇本：第一場的「內外景」欄，那是「請你先填這裡」的引導（§7.1）。
 * `documentEnd` ＝ 載入既有劇本：**文件末端**，也就是稿子目前的最後面。
 * 兩者的判準是同一條 —— 手不必先去點一下才能開始工作。
 *
 * 注意 `documentEnd` 不是「上次游標停的地方」—— 上次寫到第三場然後關掉分頁的人，回來會落在
 * 第五十場的末端。真要記住游標得存 selection，那是另一件事（且要先想清楚多裝置怎麼算）。
 */
export type InitialFocus = "sceneMeta" | "documentEnd";

export function useScreenplayEditor(
  initialContent?: object,
  initialFocus: InitialFocus = "sceneMeta",
) {
  return useEditor({
    // Next SSR：先不 render，等 client 掛載，避開 hydration mismatch。
    immediatelyRender: false,
    extensions: [
      baseStarterKit(),
      Doc,
      SceneNode,
      ActionNode,
      DialogueNode,
      InsertShotNode,
      SceneIds,
      SceneNumbers,
      BlockCycle,
      ContinueBlock,
      SelectScope,
      NextScene,
      Slash,
      SoftBreak,
      VerticalNav,
    ],
    content: initialContent ?? emptyScreenplay(),
    // 進入編輯器時，手不必先去點一下 —— 落點由 `initialFocus` 決定。
    // `sceneMeta` 走焦點串接（SceneView 掛載時 claim，見 nodes/scene.tsx 的 useEffect）；
    // `documentEnd` 沒有節點要認領，直接把游標放到文件末端並捲進畫面。
    onCreate({ editor }) {
      if (initialFocus === "documentEnd") {
        // 上一個 editor instance 可能留下沒人認領的請求（`/next` 發完請求，新 SceneView
        // 還沒掛載使用者就離開了）。`pending` 活在 module 層，不清掉的話回到 /editor 時
        // 同一個 sceneId 掛上來就被 claim，chip 會把焦點從文件末端搶走。
        claimFocus(() => true);
        editor.commands.focus("end");
        return;
      }
      const first = topLevelSceneIds(editor.state.doc)[0];
      if (first) requestFocus({ kind: "sceneMeta", sceneId: first });
    },
  });
}
