/**
 * `Enter` —— 在場次區塊裡「延續當前型別」（使用者回饋 2026-09-03）。
 *
 * ProseMirror 預設 `splitBlock`：游標在區塊尾端時，新區塊會退回該內容位置的預設型別
 * （`sceneBlock` group 的第一個 ＝ `action`）。編劇的心智模型不是這樣 —— 描述接描述、
 * 對白接對白、插入畫面接插入畫面；換型別是 `Tab`（環）或 `/` 選單的**明確意圖**，不是
 * `Enter` 的副作用。插入畫面也因此回到「一個 action 一段」（原本 #10 讓它變成可多行模式，
 * 現撤回）。
 *
 * 對白的 `Enter`：起一段**新的**對白 —— 說話者重新指定。新區塊 attr 走 schema 預設
 * （`character: null`），焦點送進新區塊的人物欄（`requestFocus` → 新 `DialogueView` 掛載
 * 時 `claim`），不繼承上一段的人名。
 *
 * 攔截條件：塌陷或單一區塊內的文字選取，且落在 `action`／`dialogue`／`insertShot`。
 * 其餘情況（跨區塊選取、`AllSelection`、非場次區塊）回 `false`，交還 ProseMirror 預設。
 *
 * **例外**：還什麼都沒寫的對白／插入畫面（`isBlankBlock`）按 `Enter` ＝ 取消型別、退回描述
 * （action）——選錯型別時的退路，不是再生一個同樣空的區塊。
 *
 * `Shift+Enter` 不歸這裡管 —— 那是 `extensions/soft-break` 的區塊內軟換行。
 */
import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { sceneContext } from "../address";
import { isBlankBlock, setBlockTypeAt } from "../block-types";
import { requestFocus } from "../focus";

const SCENE_BLOCKS = new Set(["action", "dialogue", "insertShot"]);

/** 「還什麼都沒寫就按 Enter」＝ 取消這個型別，退回描述。動作本身就是退路，不在其中。 */
const ESCAPABLE = new Set(["dialogue", "insertShot"]);

export const ContinueBlock = Extension.create({
  name: "continueBlock",
  // 壓過 StarterKit keymap 的 splitBlock（priority 1000）與 sceneBlock 節點（1100）。
  priority: 1101,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof TextSelection)) return false;
        const { $from, $to } = selection;
        if (!$from.sameParent($to)) return false;

        const parent = $from.parent;
        if (!SCENE_BLOCKS.has(parent.type.name)) return false;

        const ctx = sceneContext($from);

        // 空的對白／插入畫面按 Enter ＝ 取消這個區塊，直接變回描述（action）——不是再生一個
        // 同樣空的區塊。選錯型別的退路，與「空區塊上按 Tab 換型別」同一組手勢。
        // 使用者回饋 2026-09-03（第四輪）。
        if (ctx && ESCAPABLE.has(parent.type.name) && isBlankBlock(parent)) {
          return setBlockTypeAt(
            this.editor,
            { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex },
            "action",
          );
        }

        // 對白：新那段要重新指定說話者 —— 先排一個「人物欄」focus 請求，指向即將生出的
        // 下一個區塊（blockIndex + 1）。requestFocus 早於新 DialogueView 掛載，掛載時 claim。
        if (parent.type.name === "dialogue" && ctx) {
          requestFocus({
            kind: "speaker",
            sceneId: ctx.sceneId,
            blockIndex: ctx.blockIndex + 1,
          });
        }

        return this.editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            tr.deleteSelection();
            // 同型別、attr 走 schema 預設（對白 → character 清空）。
            tr.split(tr.mapping.map($from.pos), 1, [{ type: parent.type }]);
            tr.scrollIntoView();
          }
          return true;
        });
      },
    };
  },
});
