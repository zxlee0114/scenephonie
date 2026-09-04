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
import type { Node as PMNode } from "@tiptap/pm/model";

import { hasEmptySceneMeta } from "@scenephonie/schema";

import { topLevelSceneIds } from "./command-bridge";
import { emptyScreenplay } from "./empty-screenplay";
import { claimFocus, requestFocus } from "./focus";
import { resetSceneBirth } from "./scene-birth";
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
 * `documentEnd` ＝ 載入既有劇本：**文件末端**，也就是稿子目前的最後面 —— 除非最後一場
 * 還沒開工（metadata 全空且沒有內文），那時落點是該場的 chip row（票券 31，見 `lastScene`
 * 附近的註解）。
 * 兩者的判準是同一條 —— 手不必先去點一下才能開始工作。
 *
 * 注意 `documentEnd` 不是「上次游標停的地方」—— 上次寫到第三場然後關掉分頁的人，回來會落在
 * 第五十場的末端。真要記住游標得存 selection，那是另一件事（且要先想清楚多裝置怎麼算）。
 */
export type InitialFocus = "sceneMeta" | "documentEnd";

/** doc 的最後一個頂層場次；doc 為空時 `null`。 */
function lastScene(doc: PMNode): PMNode | null {
  const last = doc.lastChild;
  return last && last.type.name === "scene" ? last : null;
}

/**
 * 「這一場還沒開工」——`/next` 剛建完、人還沒填任何東西的樣子（票券 31）。
 *
 * metadata 全空**且**沒有內文兩條都要成立：
 * - 填了一半代表人已經在處理這一場，把游標搶回 chip 會打斷他；
 * - 有內文（先寫戲再回頭填表）代表工作已經在內文裡，一樣不該搶。
 */
function isUnstartedScene(scene: PMNode): boolean {
  if (!hasEmptySceneMeta(scene)) return false;
  // 「沒有內文」＝ 還是 `/next` 剛產出的形狀：單一空 `action` 區塊（kernel 的 `emptyScene()`）。
  // 用 `textContent === ""` 判會太寬 —— 空的對白或插入畫面區塊也沒有文字，但那是人已經把
  // 游標帶進內文、按過 Tab 的痕跡，一樣不該把焦點搶回 chip。
  const only = scene.childCount === 1 ? scene.firstChild : null;
  return only != null && only.type.name === "action" && only.content.size === 0;
}

/**
 * 末端那個區塊若是「人名、台詞都空」的對白，它的區塊序；否則 `null`（使用者回饋 2026-09-04）。
 *
 * 同一條判準的下一格：空對白的「請你先填這裡」是人物欄，不是台詞內文 —— 對白區塊在
 * `/next` 之後是按 Tab 轉出來的，人剛宣告「這裡要有人講話」，卻還沒說是誰。
 * 填了人物就代表已經在寫台詞，不再搶。
 */
function unstartedDialogueIndex(scene: PMNode): number | null {
  const index = scene.childCount - 1;
  const last = index >= 0 ? scene.child(index) : null;
  if (!last || last.type.name !== "dialogue") return null;
  return last.attrs.character == null && last.content.size === 0 ? index : null;
}

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
    // 上一個 editor instance 可能留下沒人認領的一次性請求（`/next` 發完請求，新 SceneView
    // 還沒掛載使用者就離開了）。兩本登記簿都活在 module 層，不清掉的話回到 /editor 時同一個
    // sceneId 掛上來就被領走：focus 的 `pending` 會讓 chip 把焦點從文件末端搶走（票券 26），
    // scene-birth 的 `born` 會讓「載入」被當成「剛新增」—— 重播浮現動畫並捲一次打字餘裕
    // （票券 27）。
    //
    // ⚠️ 清在 `onBeforeCreate` 不是 `onCreate`：`onCreate` **晚於**首批 node view 掛載
    // （見 `./focus` 的註解），那時 SceneView 已經把過期的登記領走了。`onBeforeCreate` 在
    // 建構當下同步跑，早於任何 node view。
    onBeforeCreate() {
      claimFocus(() => true);
      resetSceneBirth();
    },
    // 進入編輯器時，手不必先去點一下 —— 落點由 `initialFocus` 決定。
    // `sceneMeta` 走焦點串接（SceneView 掛載時 claim，見 nodes/scene.tsx 的 useEffect）；
    // `documentEnd` 一般沒有節點要認領，直接把游標放到文件末端並捲進畫面；但末場若還沒開工，
    // 落點改為該場的 chip row —— 同一個文件狀態不該因為「剛建完」還是「重整回來」而有兩種答案
    // （票券 31）。
    onCreate({ editor }) {
      if (initialFocus === "documentEnd") {
        const last = lastScene(editor.state.doc);
        // 零場次的稿子沒有「文件末端」可以站（票券 32），但編輯器仍要拿到焦點 —— 空狀態寫著
        // 「或使用快捷鍵 ⌘ + Enter 開始寫作」，而那個鍵綁在編輯器上，焦點不在就是句謊話。
        //
        // ⚠️ 這裡用同步的 `view.focus()`，不是 tiptap 的 `commands.focus()`：後者排進
        // requestAnimationFrame，那一幀若落在使用者按下「＋ 新增場次」之後，就會把焦點從新場次的
        // 內外景欄搶回內文，焦點串接（§7.1）當場斷掉 —— 機器越忙越容易中，CI 上必中。
        // 同步做完就沒有這個縫。
        if (!last) {
          editor.view.focus();
          return;
        }
        const sceneId = last.attrs.sceneId as string;
        if (isUnstartedScene(last)) {
          requestFocus({ kind: "sceneMeta", sceneId });
          return;
        }
        const blockIndex = unstartedDialogueIndex(last);
        if (blockIndex != null) {
          requestFocus({ kind: "speaker", sceneId, blockIndex });
          return;
        }
        editor.commands.focus("end");
        return;
      }
      const first = topLevelSceneIds(editor.state.doc)[0];
      if (first) requestFocus({ kind: "sceneMeta", sceneId: first });
    },
  });
}
