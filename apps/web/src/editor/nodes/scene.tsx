/**
 * 場次 node view —— §7.9（不變式 G）／§7.10／§7.11。
 *
 * 場次是有起點的內容容器，但**不畫邊框**：邊界靠場次標記、gutter 與間距（見 editor.css）。
 * 場次號是 decoration（`../extensions/scene-numbers`）—— 住 gutter、不進 content flow、不可 select、
 * 不進 tab 序；typography role 只是第三支撐。內嵌簡表（chip row）**常駐、不可被預設 UI 收合**。
 *
 * node view 預設「節點沒變就不重繪」，decoration 變了會直接跳過 —— 場次號與整場選取狀態都活在
 * decoration 裡，所以自訂重繪條件（比自己那一份的簽章，不是整個 decoration 陣列，否則每按一鍵
 * 全部場次重繪）。§7.7。
 */
"use client";

import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { Decoration } from "@tiptap/pm/view";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { INT_EXT_VALUES, TIME_VALUES, type LocationRef } from "@scenephonie/schema";

import { CjkField } from "../cjk-field";
import { claimFocus } from "../focus";
import { requestNextScene } from "../extensions/next-scene";
import { sceneNumberOf, type SceneNumberSpec } from "../extensions/scene-numbers";
import { Scene } from "../schema";

/** 欄位裡的 Tab 不能冒泡到 BlockCycle —— 否則會把游標所在區塊轉成別的型別，欄位當場消失。 */
const swallowTab = (e: ReactKeyboardEvent) => {
  if (e.key === "Tab") e.stopPropagation();
};

// 票券 04 尚無地點實體（票券 08）—— locationId 先為 null，形狀已是 kernel 的 LocationRef。
type SceneLocation = (Omit<LocationRef, "locationId"> & { locationId: string | null }) | null;

function SceneView({ node, editor, updateAttributes, decorations }: NodeViewProps) {
  const firstField = useRef<HTMLSelectElement>(null);
  const sceneId = node.attrs.sceneId as string;

  useEffect(() => {
    if (claimFocus((p) => p.kind === "sceneMeta" && p.sceneId === sceneId)) {
      firstField.current?.focus();
    }
  });

  const spec: SceneNumberSpec | undefined = sceneNumberOf(
    decorations as unknown as readonly Decoration[],
  );
  const label = spec?.sceneNo ?? "?";

  const intExt = (node.attrs.intExt as string | null) ?? "";
  const time = (node.attrs.time as string | null) ?? "";
  const location = (node.attrs.location as SceneLocation) ?? null;

  return (
    <NodeViewWrapper className={`scene${spec?.selected ? " is-node-selected" : ""}`}>
      {/* 場次號 decoration：gutter、不可編輯、不可 select、不吃指標事件（CSS 也再擋一層）。 */}
      <div className="scene__number" contentEditable={false} aria-hidden="true">
        {label}
      </div>

      {/* 內嵌簡表 —— 常駐。缺漏要看得出來（空 metadata → 自動草稿 → 匯出前被攔）。 */}
      <div className="scene__chips" contentEditable={false} onKeyDown={swallowTab}>
        <label className={`scene__chip${intExt ? "" : " scene__chip--empty"}`}>
          <span className="sr-only">內外</span>
          <select
            ref={firstField}
            value={intExt}
            onChange={(e) => updateAttributes({ intExt: e.target.value || null })}
          >
            <option value="">內外</option>
            {INT_EXT_VALUES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className={`scene__chip${time ? "" : " scene__chip--empty"}`}>
          <span className="sr-only">時間</span>
          <select value={time} onChange={(e) => updateAttributes({ time: e.target.value || null })}>
            <option value="">時間</option>
            {TIME_VALUES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <span className={`scene__chip${location ? "" : " scene__chip--empty"}`}>
          <CjkField
            placeholder="地點"
            value={location?.displayName ?? ""}
            onCommit={(v) => {
              const name = v.trim();
              // 票券 04 尚無地點實體（票券 08）—— 先存無 id 的引用形狀。
              updateAttributes({ location: name ? { locationId: null, displayName: name } : null });
            }}
          />
        </span>
      </div>

      <NodeViewContent className="scene__body" />

      {/* 場次之外沒有可點的空間，「新增下一場」按鈕住在腳部。滑鼠點的入口自己傳 sceneId。 */}
      <div className="scene__foot" contentEditable={false}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            requestNextScene(editor, sceneId);
          }}
        >
          ＋ 新增下一場
        </button>
      </div>
    </NodeViewWrapper>
  );
}

/** 重繪判斷：號碼或整場選取狀態變了才重繪這一場（不比整個 decoration 陣列）。 */
function sigOf(decorations: readonly Decoration[]): string {
  const spec = sceneNumberOf(decorations);
  return `${spec?.sceneNo ?? ""}:${spec?.selected ? 1 : 0}`;
}

export const SceneNode = Scene.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SceneView, {
      update: ({ oldNode, newNode, oldDecorations, newDecorations, updateProps }) => {
        if (oldNode.type !== newNode.type) return false;
        if (
          oldNode !== newNode ||
          sigOf(oldDecorations as unknown as readonly Decoration[]) !==
            sigOf(newDecorations as unknown as readonly Decoration[])
        ) {
          updateProps();
        }
        return true;
      },
    });
  },
});
