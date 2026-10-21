/**
 * 點場次表一列開的預覽（票券 15 驗收時加的）：先看這一場寫了什麼 —— 點錯了關掉就好，確定要改
 * 才按「到劇本」跳回編輯器。唯讀：預覽不是第二個編輯器，要改就回劇本（場次表沒有寫入路徑）。
 *
 * 開關的手勢照 `ShortcutOverview`：點外面或 Esc 關、焦點進面板、關的時候還給原本的地方。
 * 開著的時候鎖住底下的頁面 —— 滾輪只捲預覽的內文。
 */
"use client";

import type { LabeledSceneTableRow } from "@scenephonie/schema";
import { useEffect, useRef, useState } from "react";

import { BLOCK_META } from "@/editor/block-types";

import type { PreviewBlock, PreviewSegment } from "./scene-preview";

export function ScenePreview({
  row,
  segments,
  labelOf,
  onClose,
  onOpenScene,
}: {
  row: LabeledSceneTableRow;
  segments: readonly PreviewSegment[];
  /** 子場次的場次號（`5.1`）；草稿不進表、沒有場次號時給 `undefined`。 */
  labelOf: (sceneId: string) => string | undefined;
  onClose: () => void;
  /** 「到劇本」：跳回編輯器並定位到這一場。 */
  onOpenScene: (sceneId: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  /** 開啟前焦點在哪 —— 關閉時要還它（同 `ShortcutOverview`）。 */
  const [returnTo] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  const close = () => {
    onClose();
    returnTo?.focus();
  };

  return (
    <div className="scene-preview__scrim" onMouseDown={close}>
      <div
        ref={panel}
        className="scene-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-preview-title"
        tabIndex={-1}
        // 點面板裡面不該關掉它。
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          close();
        }}
      >
        <div className="scene-preview__head">
          <h2 id="scene-preview-title" className="scene-preview__title">
            {[row.label, row.intExt, row.time, row.location].join("　")}
          </h2>
        </div>
        {row.appearingCharacters && <p className="scene-preview__cast">{row.appearingCharacters}</p>}

        <div className="scene-preview__body">
          {segments.map((segment, i) =>
            segment.subscene ? (
              <section key={segment.subscene.sceneId} className="scene-preview__subscene">
                <h3 className="scene-preview__subscene-title">
                  {[labelOf(segment.subscene.sceneId), segment.subscene.kind].filter(Boolean).join("　")}
                </h3>
                <Blocks blocks={segment.blocks} />
              </section>
            ) : (
              <Blocks key={i} blocks={segment.blocks} />
            ),
          )}
        </div>

        <div className="scene-preview__actions">
          {/* 跟「到劇本」並排在底下，不跟標題搶一行（地點長的時候會撞在一起）。 */}
          <button type="button" className="scene-preview__close" onClick={close}>
            關閉（Esc）
          </button>
          <button type="button" className="scene-preview__open" onClick={() => onOpenScene(row.sceneId)}>
            到劇本這一場
          </button>
        </div>
      </div>
    </div>
  );
}

function Blocks({ blocks }: { blocks: readonly PreviewBlock[] }) {
  return blocks.map((block, i) => {
    if (block.type === "dialogue") {
      return (
        <div key={i} className="scene-preview__dialogue">
          <p className="scene-preview__speaker">
            {block.speaker ?? "（未指定）"}
            {block.voiceStyle !== "一般" && ` (${block.voiceStyle})`}
          </p>
          <p>{block.text}</p>
        </div>
      );
    }
    if (block.type === "insertShot") {
      return (
        <div key={i} className="scene-preview__insert-shot">
          <p className="scene-preview__tag">{BLOCK_META.insertShot.label}</p>
          <p>{block.text}</p>
        </div>
      );
    }
    return (
      <p key={i} className="scene-preview__action">
        {block.text}
      </p>
    );
  });
}
