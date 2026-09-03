/**
 * `Enter` —— 在場次區塊裡「延續當前型別」（使用者回饋 2026-09-03）。
 *
 * ProseMirror 預設 `splitBlock`：游標在區塊尾端時，新區塊會退回該內容位置的預設型別
 * （`sceneBlock` group 的第一個 ＝ `action`）。編劇的心智模型不是這樣 —— 描述接描述、
 * 對白接對白、插入畫面接插入畫面；換型別是 `Tab`（環）或 `/` 選單的**明確意圖**，不是
 * `Enter` 的副作用。插入畫面也因此回到「一份劇本裡一個 action 一段」（原本 #10 讓它變成
 * 可多行模式，現撤回）。
 *
 * 攔截條件：塌陷或單一區塊內的文字選取，且落在 `action`／`dialogue`／`insertShot`。
 * 切出一個**同型別**的新區塊；`dialogue` 連人物引用與發聲方式一起帶下去（同一個人繼續講）。
 * 其餘情況（跨區塊選取、`AllSelection`、非場次區塊）回 `false`，交還 ProseMirror 預設。
 *
 * `Shift+Enter` 不歸這裡管 —— 那是 `extensions/soft-break` 的區塊內軟換行。
 */
import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

const SCENE_BLOCKS = new Set(["action", "dialogue", "insertShot"]);

export const ContinueBlock = Extension.create({
  name: "continueBlock",
  // 壓過 StarterKit keymap 的 splitBlock（priority 1000）與 sceneBlock 節點（1100）。
  priority: 1101,
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.commands.command(({ state, tr, dispatch }) => {
          const { selection } = state;
          if (!(selection instanceof TextSelection)) return false;
          const { $from, $to } = selection;
          if (!$from.sameParent($to)) return false;

          const parent = $from.parent;
          if (!SCENE_BLOCKS.has(parent.type.name)) return false;

          // 對白：同一個人繼續講 —— 人物引用與發聲方式帶到新區塊，不要每次 Enter 都清空。
          const attrs =
            parent.type.name === "dialogue"
              ? { character: parent.attrs.character, voiceStyle: parent.attrs.voiceStyle }
              : null;

          if (dispatch) {
            tr.deleteSelection();
            tr.split(tr.mapping.map($from.pos), 1, [{ type: parent.type, attrs }]);
            tr.scrollIntoView();
          }
          return true;
        }),
    };
  },
});
