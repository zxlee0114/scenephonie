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
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

import { unlistedSpeakers, type DialogueCharacterRef } from "@scenephonie/schema";

import { sceneContext, type BlockAddress } from "../address";

/** 一份打開著的提示：哪一句對白、問的是哪幾位。 */
export interface AppearingPrompt extends BlockAddress {
  readonly speakers: readonly DialogueCharacterRef[];
}

interface PromptState {
  /** 游標**目前**所在的對白（不在對白裡就是 `null`）—— 下一次離開時要問的就是它。 */
  readonly inside: BlockAddress | null;
  readonly prompt: AppearingPrompt | null;
}

const key = new PluginKey<PromptState>("appearingPrompt");

/** 收起選單的 transaction meta。 */
const CLOSE = "close";

function sceneById(doc: PMNode, sceneId: string): PMNode | null {
  let found: PMNode | null = null;
  doc.forEach((node) => {
    if (!found && node.type.name === "scene" && node.attrs.sceneId === sceneId) found = node;
  });
  return found;
}

/**
 * 那一句**當下**該問的人；沒有就是 `null`。
 *
 * 定址用 `sceneId ＋ 區塊序` 而不是 doc 座標：kernel command 經 bridge 是整份 replace，
 * 座標 map 過去全都落在 doc 的一端，只有 id 定址活得過那一步（`../address`）。
 */
function promptAt(doc: PMNode, at: BlockAddress): AppearingPrompt | null {
  const scene = sceneById(doc, at.sceneId);
  const speakers = scene ? unlistedSpeakers(scene, at.blockIndex) : [];
  return speakers.length > 0 ? { ...at, speakers } : null;
}

/** 游標所在的對白區塊；不在對白裡回 `null`。 */
function dialogueUnder(state: EditorState): BlockAddress | null {
  const { $from } = state.selection;
  const ctx = sceneContext($from);
  if (!ctx) return null;
  const block = $from.node(ctx.sceneDepth).maybeChild(ctx.blockIndex);
  return block?.type.name === "dialogue" ? { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex } : null;
}

const sameBlock = (a: BlockAddress | null, b: BlockAddress | null) =>
  a?.sceneId === b?.sceneId && a?.blockIndex === b?.blockIndex;

/** 兩份提示問的是不是同一件事（state 沒變就回同一個物件，React 才不會白白重繪）。 */
const samePrompt = (a: AppearingPrompt | null, b: AppearingPrompt | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    sameBlock(a, b) &&
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
          apply(tr, prev, _old, next) {
            if (tr.getMeta(key) === CLOSE) return { ...prev, prompt: null };

            // 開著的那一份跟著 doc 走：他在 chip row 補上了、或按了選單，落差不在就收起。
            let prompt = prev.prompt && tr.docChanged ? promptAt(next.doc, prev.prompt) : prev.prompt;

            const inside = dialogueUnder(next);
            if (prev.inside && !sameBlock(prev.inside, inside)) {
              // 離開了一句對白 —— 有該問的人就換成問這一句（開著的舊選單讓位給剛寫完的這一句）。
              prompt = promptAt(next.doc, prev.inside) ?? prompt;
            }

            if (sameBlock(inside, prev.inside) && samePrompt(prompt, prev.prompt)) return prev;
            return {
              inside: sameBlock(inside, prev.inside) ? prev.inside : inside,
              prompt: samePrompt(prompt, prev.prompt) ? prev.prompt : prompt,
            };
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
