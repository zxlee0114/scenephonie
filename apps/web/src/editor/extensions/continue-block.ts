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
 * **台詞開頭**（有字）按 `Enter` ＝ 在上方插一句空對白，原句不動（票券 62）。
 *
 * **雙 Enter**：子場次最後一個區塊是空的動作時，`Enter` 把它提升出去、回到主場次（票券 11，
 * 見 `./subscene-exit`）。
 *
 * `Shift+Enter` 不歸這裡管 —— 那是 `extensions/soft-break` 的區塊內軟換行。
 */
import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { blockAddressOf, sceneContext } from "../address";
import { isBlankBlock, setBlockTypeAt } from "../block-types";
import { requestFocus } from "../focus";
import { canLiftEmptyBlock, exitSubscene } from "./subscene-exit";

const SCENE_BLOCKS = new Set(["action", "dialogue", "insertShot"]);

/** 「還什麼都沒寫就按 Enter」＝ 取消這個型別，退回描述。動作本身就是退路，不在其中。 */
const ESCAPABLE = new Set(["dialogue", "insertShot"]);

/**
 * 這一顆 Enter 是不是「在上面插一句」—— 游標停在一句有台詞的對白**開頭**（票券 62）。登場人物
 * 提示（`./appearing-prompt`）也問這一句：那不是寫完了一句，不該問。
 */
export function insertsAbove(selection: TextSelection): boolean {
  const { $from, empty } = selection;
  return (
    empty && $from.parent.type.name === "dialogue" && $from.parentOffset === 0 && $from.parent.content.size > 0
  );
}

/**
 * `Enter` 的本體 —— 登場人物提示（`./appearing-prompt`）會先攔下這一顆 Enter，問完再從這裡接著走。
 */
export function continueBlock(editor: Editor): boolean {
  const { selection } = editor.state;
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
      editor,
      blockAddressOf(ctx),
      "action",
    );
  }

  // 雙 Enter：子場次末尾的空動作區塊再按一次 Enter ＝ 走出子場次、回到主場次（§7.1，
  // `liftEmptyBlock` 語意）。空的對白／插入畫面先走上面那條退回動作，再按一次才出去。
  if (parent.type.name === "action" && canLiftEmptyBlock($from)) {
    return exitSubscene(editor);
  }

  // 台詞開頭（有字）按 Enter ＝ 在**上方**插一句空對白（票券 62）。切開時「沒有字的那一半是新的
  // 那一半」：人物跟著台詞走，原句的人物與台詞都不動。照預設的 split，人物會留在空掉的上半段、
  // 字跑到沒有人物的下半段。台詞空著時（只填了人物）不在此列 —— 那是往下走，新對白開在下面。
  if (ctx && insertsAbove(selection)) {
    const at = $from.before();
    const tr = editor.state.tr.insert(at, parent.type.create());
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    // 同下面的理由，焦點請求一定要在插入**之後**才發。
    requestFocus({ kind: "speaker", ...blockAddressOf(ctx) });
    return true;
  }

  const split = editor.commands.command(({ tr, dispatch }) => {
    if (dispatch) {
      tr.deleteSelection();
      // 同型別、attr 走 schema 預設（對白 → character 清空）。
      tr.split(tr.mapping.map($from.pos), 1, [{ type: parent.type }]);
      tr.scrollIntoView();
    }
    return true;
  });

  // 對白：新那段要重新指定說話者 —— 焦點請求指向剛切出來的那個區塊（blockIndex + 1）。
  // ⚠️ 一定要在 split **之後**才發：DialogueView 現在會訂閱後續請求，若先發，位在
  // blockIndex + 1 的**舊**對白會搶先認領，焦點就落到別人的人物欄去了。
  if (split && parent.type.name === "dialogue" && ctx) {
    requestFocus({
      kind: "speaker",
      ...blockAddressOf(ctx),
      blockIndex: ctx.blockIndex + 1,
    });
  }

  return split;
}

export const ContinueBlock = Extension.create({
  name: "continueBlock",
  // 壓過 StarterKit keymap 的 splitBlock（priority 1000）與 sceneBlock 節點（1100）。
  priority: 1101,
  addKeyboardShortcuts() {
    return {
      Enter: () => continueBlock(this.editor),
    };
  },
});
