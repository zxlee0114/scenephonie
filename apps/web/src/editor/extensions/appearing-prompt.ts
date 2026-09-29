/**
 * 登場人物提示的**時機** —— 編劇離開一句對白的那一刻（票券 10，使用者裁決 2026-09-29）。
 *
 * 「該不該問」住在 kernel（`unlistedSpeakers`）；這裡只回答「什麼時候問、問哪一句」。
 * 選單本身畫在那一句的人物欄底下（`nodes/blocks` 的 `DialogueView`），它從這個 plugin 的
 * state 讀出自己要不要出現。
 *
 * ── 為什麼是「離開」，不是「人物欄定案」────────────────────────────────
 * 人物欄一定案游標就進了台詞，那時跳出選單正好蓋在他要寫的地方旁邊。寫完那一句、走到下一段，
 * 才是一個不打斷任何東西的時刻。**也不常駐**：原本的「一行提示＋［加入］」被否決，理由是它
 * 只有一個出口 —— 編劇要嘛加、要嘛一直看著它。
 *
 * ── 不擋寫作 ──────────────────────────────────────────────────────────
 * 不搶焦點、沒有預選列：選單出現時游標已經在下一段，Enter 與打字照舊屬於內文。預選第一列的話，
 * 他順手一個 Enter 就等於在不知情下被加進登場人物欄 —— 那比推導還糟。所以繼續打字也**不收**
 * 選單（否則寫得快的人根本看不到它），收起的只有三條路：Esc、點到別處、做出選擇；落差自己
 * 消失時（他在 chip row 補上了）也收。
 *
 * ── Esc 與「不新增」刻意分開 ──────────────────────────────────────────
 * Esc 只把這份 state 清掉，**不寫 doc**：「現在別煩我」不是判斷，下次離開那一句還會再問。
 * 「不新增」是一支 command（`dismissAppearingPrompt`），那才是記下來的判斷。
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

import { unlistedSpeakers, type DialogueCharacterRef } from "@scenephonie/schema";

import { sceneContext, type BlockAddress } from "../address";
import { blockContentPos, KERNEL_REPLACE } from "../command-bridge";

/**
 * 被追蹤的那一句對白：**doc 座標**（區塊節點之前）＋ 由它推出來的定址。
 *
 * 座標才是身分 —— 區塊序只是這一刻的讀法。上面插了一段、或上一句被 Backspace 併掉，序就換人了，
 * 而 `tr.mapping` 知道那一句實際搬去哪、或是被刪了。定址（`sceneId ＋ 序`）留著給 node view 比對
 * 「問的是不是我」，每一步都從座標重算。
 */
interface TrackedDialogue extends BlockAddress {
  readonly pos: number;
}

/** 一份打開著的提示：哪一句對白、問的是哪幾位。 */
export interface AppearingPrompt extends TrackedDialogue {
  readonly speakers: readonly DialogueCharacterRef[];
}

interface PromptState {
  /** 游標**目前**所在的對白（不在對白裡就是 `null`）—— 下一次離開時要問的就是它。 */
  readonly inside: TrackedDialogue | null;
  readonly prompt: AppearingPrompt | null;
}

const key = new PluginKey<PromptState>("appearingPrompt");

/** 收起選單的 transaction meta。 */
const CLOSE = "close";

/** `pos`（區塊節點之前）上的那一句對白；不是對白回 `null`。 */
function dialogueAt(doc: PMNode, pos: number): TrackedDialogue | null {
  if (pos < 0 || pos > doc.content.size) return null;
  if (doc.nodeAt(pos)?.type.name !== "dialogue") return null;
  const ctx = sceneContext(doc.resolve(pos));
  return ctx && { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex, pos };
}

/**
 * 那一句在這筆 transaction 之後的位置；被刪掉（併進別段、整句拿掉）回 `null`。
 *
 * bridge 的整份 replace 是例外：`tr.mapping` 會把一切 map 到 doc 的一端，那時唯一活得過去的是
 * id 定址（`../address`）—— 那些 command 不增減區塊（改結構的會自己放游標），序就還是它。
 */
function follow(tr: Transaction, doc: PMNode, at: TrackedDialogue): TrackedDialogue | null {
  if (!tr.docChanged) return at;
  if (tr.getMeta(KERNEL_REPLACE)) {
    const content = blockContentPos(doc, at.sceneId, at.blockIndex);
    return content == null ? null : dialogueAt(doc, content - 1);
  }
  const mapped = tr.mapping.mapResult(at.pos, 1);
  return mapped.deleted ? null : dialogueAt(doc, mapped.pos);
}

/** 那一句**當下**該問的人；沒有就是 `null`。 */
function promptAt(doc: PMNode, at: TrackedDialogue): AppearingPrompt | null {
  // 區塊節點之前那個座標的 parent 就是它所在的場次。
  const speakers = unlistedSpeakers(doc.resolve(at.pos).parent, at.blockIndex);
  return speakers.length > 0 ? { ...at, speakers } : null;
}

/** 游標所在的對白區塊；不在對白裡回 `null`。 */
function dialogueUnder(state: EditorState): TrackedDialogue | null {
  const { $from } = state.selection;
  const ctx = sceneContext($from);
  if (!ctx || $from.depth <= ctx.sceneDepth) return null;
  return dialogueAt(state.doc, $from.before(ctx.sceneDepth + 1));
}

const samePlace = (a: TrackedDialogue | null, b: TrackedDialogue | null) =>
  a === b ||
  (a !== null && b !== null && a.pos === b.pos && a.sceneId === b.sceneId && a.blockIndex === b.blockIndex);

/** 兩份提示問的是不是同一件事（state 沒變就回同一個物件，React 才不會白白重繪）。 */
const samePrompt = (a: AppearingPrompt | null, b: AppearingPrompt | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    samePlace(a, b) &&
    a.speakers.length === b.speakers.length &&
    a.speakers.every((s, i) => s.id === b.speakers[i]!.id && s.displayName === b.speakers[i]!.displayName));

export const AppearingPromptPlugin = Extension.create({
  name: "appearingPrompt",

  addProseMirrorPlugins() {
    return [
      new Plugin<PromptState>({
        key,
        state: {
          // 載入時不記 `inside`：編劇還沒走進任何一句對白，初始焦點把游標搬到文件末端不是「離開」。
          init: () => ({ inside: null, prompt: null }),
          apply(tr, prev, old, next) {
            if (tr.getMeta(key) === CLOSE) return { ...prev, prompt: null };

            const was = prev.inside && follow(tr, next.doc, prev.inside);
            // 開著的那一份跟著那一句走，也跟著 doc 重問一次：他在 chip row 補上了、按了選單、
            // 或那一句被刪了，落差不在就收起。
            let prompt = prev.prompt;
            if (prompt && tr.docChanged) {
              const at = follow(tr, next.doc, prompt);
              prompt = at && promptAt(next.doc, at);
            }

            // bridge 的整份 replace 把 selection 沖到 doc 一端 —— 那不是編劇移動了游標（例如人物欄
            // 定案那一下，使用者否決過在那一刻問）。只有明確放回去的游標才算數。沖過去之後
            // selection 會**停在**那一端，所以其餘 transaction 也要游標真的動了才算：緊接著的
            // focus／meta transaction 不動 selection，不能把那個被沖走的位置當成他走過去的。
            const moved = tr.getMeta(KERNEL_REPLACE)
              ? tr.selectionSet
              : !old.selection.eq(next.selection);
            const inside = moved ? dialogueUnder(next) : was;
            if (moved && was && !samePlace(was, inside)) {
              // 離開了一句對白 —— 有該問的人就換成問這一句（開著的舊選單讓位給剛寫完的這一句）。
              prompt = promptAt(next.doc, was) ?? prompt;
            }

            const nextInside = samePlace(inside, prev.inside) ? prev.inside : inside;
            const nextPrompt = samePrompt(prompt, prev.prompt) ? prev.prompt : prompt;
            if (nextInside === prev.inside && nextPrompt === prev.prompt) return prev;
            return { inside: nextInside, prompt: nextPrompt };
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // 只在選單開著時接手 Esc；否則把這顆鍵還給別人。
      Escape: () => {
        if (!appearingPrompt(this.editor)) return false;
        closeAppearingPrompt(this.editor);
        return true;
      },
    };
  },
});

/** 目前開著的提示；沒有就是 `null`。 */
export function appearingPrompt(editor: Editor): AppearingPrompt | null {
  return key.getState(editor.state)?.prompt ?? null;
}

/** 收起選單 —— **不寫 doc、不進 history**：Esc 與點到別處都是「現在別煩我」，不是判斷。 */
export function closeAppearingPrompt(editor: Editor): void {
  if (!appearingPrompt(editor)) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, CLOSE).setMeta("addToHistory", false));
}
