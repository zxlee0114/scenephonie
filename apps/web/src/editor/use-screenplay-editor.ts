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

import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";

import { topLevelSceneIds } from "./command-bridge";
import { requestFocus } from "./focus";
import { ActionNode, DialogueNode, InsertShotNode } from "./nodes/blocks";
import { SceneNode } from "./nodes/scene";
import { BlockCycle } from "./extensions/block-cycle";
import { NextScene } from "./extensions/next-scene";
import { SceneIds } from "./extensions/scene-ids";
import { SceneNumbers } from "./extensions/scene-numbers";
import { SelectScope } from "./extensions/select-scope";
import { Slash } from "./extensions/slash";
import { SoftBreak } from "./extensions/soft-break";
import { Doc } from "./schema";
import { baseStarterKit } from "./starter-kit";

/** 一份只有一個空場次的 doc（ProseMirror JSON）。 */
export function emptyScreenplay(): object {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, kernelSchema.node("action", null, [])),
    ])
    .toJSON() as object;
}

export function useScreenplayEditor(initialContent?: object) {
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
      SelectScope,
      NextScene,
      Slash,
      SoftBreak,
    ],
    content: initialContent ?? emptyScreenplay(),
    // 進入編輯器時，手不必先去點 chip row —— 焦點落在第一場的「內外景」欄（§7.1）。
    // SceneView 掛載時 claim 這個請求（見 nodes/scene.tsx 的 useEffect）。
    onCreate({ editor }) {
      const first = topLevelSceneIds(editor.state.doc)[0];
      if (first) requestFocus({ kind: "sceneMeta", sceneId: first });
    },
  });
}
