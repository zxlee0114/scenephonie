/**
 * 登場人物提示的**時機** —— 編劇寫完一句對白、按下 Enter 的那一刻（票券 10）。
 *
 * 「該不該問」住在 kernel（`unlistedSpeakers`）；這裡只回答「什麼時候問、問完怎麼接著走」。
 * 選單本身浮在那一句的台詞底下（`nodes/blocks` 的 `DialogueView`），它從這個 plugin 的
 * state 讀出自己要不要出現。
 *
 * ── 攔下那一顆 Enter，問完才開下一個區塊（使用者裁決 2026-09-29，驗收回饋）──────────
 * 說話者不在登場人物欄時，Enter 不切區塊，改成打開選單、**焦點交給選單**；編劇做出選擇
 * （或 Esc）之後才照原本的 Enter（`continueBlock`）開下一個區塊。這一刻台詞已經寫完、下一段
 * 還沒開，選單不擋任何正在寫的字。
 *
 * **只有 Enter 會問**：滑鼠點走、方向鍵走出去都不問 —— 漏掉的人留給匯出前清單（票 11／19）。
 * 原本「離開一句對白就問、不搶焦點」的版本在瀏覽器驗收時被換掉。
 *
 * ── Esc 與「不新增」刻意分開 ──────────────────────────────────────────
 * Esc 只收起選單、**不寫 doc**，然後照樣開下一個區塊：「現在別煩我」不是判斷，下次在那一句
 * 按 Enter 還會再問。（Esc 若連 Enter 一起取消，他再按一次 Enter 就又被問 —— 走不出去。）
 * 「不新增」是一支 command（`dismissAppearingPrompt`），那才是記下來的判斷。
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

import { unlistedSpeakers, type DialogueCharacterRef } from "@scenephonie/schema";

import { sceneContext, type BlockAddress } from "../address";
import { isBlankBlock } from "../block-types";
import { blockContentPos, KERNEL_REPLACE } from "../command-bridge";
import { continueBlock } from "./continue-block";

/** 一份打開著的提示：哪一句對白（doc 座標＋定址）、問的是哪幾位。 */
export interface AppearingPrompt extends BlockAddress {
  /** 區塊節點之前的座標 —— 身分；`sceneId ＋ 序` 留給 node view 比對「問的是不是我」。 */
  readonly pos: number;
  readonly speakers: readonly DialogueCharacterRef[];
}

const key = new PluginKey<AppearingPrompt | null>("appearingPrompt");

/** 打開（帶著那份提示）／收起選單的 transaction meta。 */
type PromptMeta = { open: AppearingPrompt } | "close";

/** 那一句**當下**該問的人；沒有就是 `null`。`pos` 是區塊節點之前的座標。 */
function promptAt(doc: PMNode, pos: number): AppearingPrompt | null {
  if (pos < 0 || pos > doc.content.size || doc.nodeAt(pos)?.type.name !== "dialogue") return null;
  const $pos = doc.resolve(pos);
  const ctx = sceneContext($pos);
  if (!ctx) return null;
  // 區塊節點之前那個座標的 parent 就是它所在的場次。
  const speakers = unlistedSpeakers($pos.parent, ctx.blockIndex);
  return speakers.length > 0 ? { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex, pos, speakers } : null;
}

/**
 * 選單開著時 doc 變了（按了選單、或別處改了這一場）：跟著那一句走、重問一次，落差不在就收起。
 *
 * bridge 的整份 replace 是例外：`tr.mapping` 會把一切 map 到 doc 的一端，那時唯一活得過去的是
 * id 定址 —— 那些 command 不增減區塊（改結構的會自己放游標），序就還是它。
 */
function follow(tr: Transaction, doc: PMNode, at: AppearingPrompt): AppearingPrompt | null {
  if (tr.getMeta(KERNEL_REPLACE)) {
    const content = blockContentPos(doc, at.sceneId, at.blockIndex);
    return content == null ? null : promptAt(doc, content - 1);
  }
  const mapped = tr.mapping.mapResult(at.pos, 1);
  return mapped.deleted ? null : promptAt(doc, mapped.pos);
}

/** 兩份提示問的是不是同一件事（state 沒變就回同一個物件，React 才不會白白重繪）。 */
const samePrompt = (a: AppearingPrompt | null, b: AppearingPrompt | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.pos === b.pos &&
    a.sceneId === b.sceneId &&
    a.blockIndex === b.blockIndex &&
    a.speakers.length === b.speakers.length &&
    a.speakers.every((s, i) => s.id === b.speakers[i]!.id && s.displayName === b.speakers[i]!.displayName));

export const AppearingPromptPlugin = Extension.create({
  name: "appearingPrompt",
  // 搶在 `ContinueBlock`（1101）之前看那一顆 Enter。
  priority: 1102,

  addProseMirrorPlugins() {
    return [
      new Plugin<AppearingPrompt | null>({
        key,
        state: {
          init: () => null,
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(key) as PromptMeta | undefined;
            if (meta === "close") return null;
            if (meta) return meta.open;
            if (!prev || !tr.docChanged) return prev;
            const now = follow(tr, next.doc, prev);
            return samePrompt(now, prev) ? prev : now;
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        if (key.getState(state)) return true;
        const { selection } = state;
        if (!(selection instanceof TextSelection) || !selection.$from.sameParent(selection.$to)) return false;
        const { $from } = selection;
        // 空對白的 Enter 是「退回描述」（`continueBlock`），不是寫完了一句。
        if ($from.parent.type.name !== "dialogue" || isBlankBlock($from.parent)) return false;
        const prompt = promptAt(state.doc, $from.before($from.depth));
        if (!prompt) return false;
        this.editor.view.dispatch(state.tr.setMeta(key, { open: prompt } satisfies PromptMeta));
        return true;
      },
    };
  },
});

/** 目前開著的提示；沒有就是 `null`。 */
export function appearingPrompt(editor: Editor): AppearingPrompt | null {
  return key.getState(editor.state) ?? null;
}

/** 收起選單 —— **不寫 doc、不進 history**：Esc 與點到別處都是「現在別煩我」，不是判斷。 */
export function closeAppearingPrompt(editor: Editor): void {
  if (!appearingPrompt(editor)) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(key, "close" satisfies PromptMeta).setMeta("addToHistory", false),
  );
}

/**
 * 問完了 —— 收起選單、焦點還給內文，接著做那一顆被攔下來的 Enter。游標一直停在那一句台詞裡
 * （焦點在選單上時 ProseMirror 的 selection 不動），所以 `continueBlock` 切的就是原本那個位置。
 */
export function resumeAfterAppearingPrompt(editor: Editor): void {
  closeAppearingPrompt(editor);
  editor.view.focus();
  continueBlock(editor);
}
