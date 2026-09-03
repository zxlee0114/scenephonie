/**
 * 三種 sceneBlock 的 node view（§4.6）。schema（`../schema`）擁有 node spec，這裡只疊 view。
 *
 * 三種型別**不用顏色區分** —— 它們是內容不是 decoration，上顏色等於重建「格式即內容」的暗示
 * （§7.11）。差別靠縮排、欄寬、spacing 與 rhythm（見 editor.css），加對白的人物欄與插入畫面的
 * 結構標籤。
 *
 * 「動作」「插入畫面」是純結構外殼 —— 用原生 ProseMirror node view（`staticBlockView`），不進
 * React。只有「對白」有互動狀態（人物欄 `CjkField`＋焦點串接）才用 `ReactNodeViewRenderer`。
 * 動機見 `staticBlockView` 註解（票券 04 驗收 #7：React node view mount 期 `flushSync` 卡死）。
 */
"use client";

import type { NodeViewRenderer } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

import type { DialogueCharacterRef } from "@scenephonie/schema";

import { sceneContext, type BlockAddress } from "../address";
import { Action, Dialogue, InsertShot } from "../schema";
import { CjkField } from "../cjk-field";
import { claimFocus } from "../focus";

/** 從 node view 反推它所在場次的 id 與自己在場次裡的序（給 pending-focus 比對用）。 */
function locateBlock(props: NodeViewProps): BlockAddress | null {
  const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
  if (pos == null) return null;
  const ctx = sceneContext(props.editor.state.doc.resolve(pos));
  return ctx && { sceneId: ctx.sceneId, blockIndex: ctx.blockIndex };
}

/**
 * 純結構 node view（無 React）——「動作」「插入畫面」只是固定外殼＋一個內容洞，沒有 React
 * 狀態。用原生 ProseMirror node view 就夠，藉此避開 `@tiptap/react` `ReactRenderer` 建構子在
 * mount 當下同步 `flushSync(render)`（dist/index.js:613，無 opt-out）與 ProseMirror `DOMObserver`
 * 互咬的重繪失控：按 Enter 會 `splitBlock` 出新區塊、掛新 node view，開著 Chrome DevTools 時
 * DOMObserver 遞送時機被打亂即卡死整個 renderer（票券 04 驗收 #7）。§7.7。
 *
 * `chrome`（如插入畫面的結構標籤）是 `contentEditable=false` 的裝飾，其 DOM 變動不是內容編輯，
 * `ignoreMutation` 只認 contentDOM 內的。
 */
function staticBlockView(wrapperClass: string, chrome?: () => HTMLElement): NodeViewRenderer {
  return () => {
    const dom = document.createElement("div");
    dom.className = wrapperClass;
    if (chrome) dom.appendChild(chrome());
    const contentDOM = document.createElement("div");
    contentDOM.className = "block__content";
    dom.appendChild(contentDOM);
    return {
      dom,
      contentDOM,
      ignoreMutation: (m) => m.type !== "selection" && !contentDOM.contains(m.target as Node),
    };
  };
}

function insertShotTag(): HTMLElement {
  const tag = document.createElement("span");
  tag.className = "block__tag";
  tag.setAttribute("contenteditable", "false");
  tag.textContent = "插入畫面";
  return tag;
}

function DialogueView(props: NodeViewProps) {
  const { node, editor, updateAttributes } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  // 票券 04 尚無人物實體（票券 08）—— id 先為 null，形狀已是 kernel 的 DialogueCharacterRef。
  const character = (node.attrs.character ?? null) as
    | (Omit<DialogueCharacterRef, "id"> & { id: string | null })
    | null;

  // 一次性：Tab 把區塊轉成對白後，新掛載的這個 node view 消費掉待決焦點請求 —— 心流串接是
  // 建立當下的動作，不是持續行為，所以只在掛載時試領（無 deps 會每次 render 都重跑）。
  useEffect(() => {
    const here = locateBlock(props);
    if (
      here &&
      claimFocus(
        (p) => p.kind === "speaker" && p.sceneId === here.sceneId && p.blockIndex === here.blockIndex,
      )
    ) {
      inputRef.current?.focus();
    }
    // deps 空陣列：props 之後的變動不該再搶焦點（見上）。
  }, []);

  /** 把游標從人物欄送進台詞開頭（getPos → 對白節點之前；+1 進內容）。正向 Tab 與 Enter 共用。 */
  const enterDialogueBody = () => {
    const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
    if (pos != null) editor.chain().focus().setTextSelection(pos + 1).run();
  };

  return (
    <NodeViewWrapper className="block block--dialogue">
      <CjkField
        ref={inputRef}
        className="block__speaker"
        placeholder="人物"
        value={character?.displayName ?? ""}
        onCommit={(v) => {
          const name = v.trim();
          // 票券 04 尚無人物實體（票券 08）—— 先存無 id 的引用形狀，之後接上真實體。
          updateAttributes({ character: name ? { id: null, displayName: name } : null });
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          // 人物欄打完按 Enter：直接進台詞（不要「按了沒反應」的錯愕）——與正向 Tab 同終點。
          // 移動焦點會 blur 這個 input，CjkField 的 onBlur 負責回寫人物名（使用者回饋 2026-09-03）。
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            enterDialogueBody();
            return;
          }
          // 欄位裡的 Tab（兩個方向都要）不能冒泡到 BlockCycle 把這個區塊轉掉（§7.1）。
          if (e.key === "Tab") {
            e.stopPropagation();
            if (!e.shiftKey) {
              // 正向 Tab：打完人物名就進台詞。反向 Tab：留在欄位，什麼都不做。
              e.preventDefault();
              enterDialogueBody();
            }
          }
        }}
      />
      <NodeViewContent className="block__content" />
    </NodeViewWrapper>
  );
}

export const ActionNode = Action.extend({
  addNodeView() {
    return staticBlockView("block block--action");
  },
});

export const DialogueNode = Dialogue.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DialogueView);
  },
});

export const InsertShotNode = InsertShot.extend({
  addNodeView() {
    return staticBlockView("block block--insert-shot", insertShotTag);
  },
  // Enter 的行為（延續當前型別，不多行）統一在 `extensions/continue-block` —— 三種區塊同一套。
});
