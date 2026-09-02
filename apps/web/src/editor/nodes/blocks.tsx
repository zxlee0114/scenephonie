/**
 * 三種 sceneBlock 的 node view（§4.6）。schema（`../schema`）擁有 node spec，這裡只疊 view。
 *
 * 三種型別**不用顏色區分** —— 它們是內容不是 decoration，上顏色等於重建「格式即內容」的暗示
 * （§7.11）。差別靠縮排、欄寬、spacing 與 rhythm（見 editor.css），加對白的人物欄與插入畫面的
 * 結構標籤。
 */
"use client";

import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { Action, Dialogue, InsertShot } from "../schema";
import { CjkField } from "../cjk-field";
import { claimFocus } from "../focus";

/** 從 node view 反推它所在場次的 id 與自己在場次裡的序（給 pending-focus 比對用）。 */
function locateBlock(props: NodeViewProps): { sceneId: string; blockIndex: number } | null {
  const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
  if (pos == null) return null;
  const $pos = props.editor.state.doc.resolve(pos);
  if ($pos.parent.type.name !== "scene") return null;
  return { sceneId: $pos.parent.attrs.sceneId as string, blockIndex: $pos.index() };
}

function ActionView() {
  return (
    <NodeViewWrapper className="block block--action">
      <NodeViewContent className="block__content" />
    </NodeViewWrapper>
  );
}

function DialogueView(props: NodeViewProps) {
  const { node, editor, updateAttributes } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const character = (node.attrs.character ?? null) as { id: string | null; displayName: string } | null;

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
  });

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
          // 欄位裡的 Tab 是「進台詞」，不能冒泡到 BlockCycle 把這個區塊轉掉。
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
            if (pos != null) {
              editor.chain().focus().setTextSelection(pos + 1).run();
            }
          }
        }}
      />
      <NodeViewContent className="block__content" />
    </NodeViewWrapper>
  );
}

function InsertShotView() {
  return (
    <NodeViewWrapper className="block block--insert-shot">
      <span className="block__tag" contentEditable={false}>
        插入畫面
      </span>
      <NodeViewContent className="block__content" />
    </NodeViewWrapper>
  );
}

export const ActionNode = Action.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ActionView);
  },
});

export const DialogueNode = Dialogue.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DialogueView);
  },
});

export const InsertShotNode = InsertShot.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InsertShotView);
  },
});
