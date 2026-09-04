/**
 * 場次 node view —— §7.9（不變式 G）／§7.10／§7.11。
 *
 * 場次是有起點的內容容器，但**不畫邊框**：邊界靠場次標記、gutter 與間距（見 editor.css）。
 * 場次號是 decoration（`../extensions/scene-numbers`）—— 住 gutter、不進 content flow、不可 select、
 * 不進 tab 序；typography role 只是第三支撐。內嵌簡表（chip row）**常駐、不可被預設 UI 收合**。
 *
 * 自訂重繪條件（見檔尾 `update`）：只在 metadata（node attr）或「場次號／整場選取」簽章變了才
 * 重繪 —— 內文改動交給 `NodeViewContent`，不驚動 React；簽章比的是自己那一份、不是整個 decoration
 * 陣列（否則每按一鍵全部場次重繪）。§7.7。
 */
"use client";

import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { Decoration } from "@tiptap/pm/view";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { INT_EXT_VALUES, TIME_VALUES, type LocationRef } from "@scenephonie/schema";

import { ChipSelect } from "../chip-select";
import { CjkField } from "../cjk-field";
import { claimFocus, subscribeFocusRequest } from "../focus";
import { consumeSceneBirth, subscribeSceneBirth } from "../scene-birth";
import { scrollToWritingPosition } from "../typewriter-scroll";
import { requestNextScene } from "../extensions/next-scene";
import { sceneNumberOf, type SceneNumberSpec } from "../extensions/scene-numbers";
import { Scene } from "../schema";

/** 欄位裡的 Tab 不能冒泡到 BlockCycle —— 否則會把游標所在區塊轉成別的型別，欄位當場消失。 */
const swallowTab = (e: ReactKeyboardEvent) => {
  if (e.key === "Tab") e.stopPropagation();
};

// 票券 04 尚無地點實體（票券 08）—— locationId 先為 null，形狀已是 kernel 的 LocationRef。
type SceneLocation = (Omit<LocationRef, "locationId"> & { locationId: string | null }) | null;

function SceneView({ node, editor, updateAttributes, decorations, getPos }: NodeViewProps) {
  const firstField = useRef<HTMLButtonElement>(null);
  const sceneId = node.attrs.sceneId as string;

  // 「新增下一場」的即時回饋：這一場若剛被建立出來，短暫掛上 .scene--just-added（CSS 自己淡出）。
  // 掛載時領一次（append 情境），並訂閱 markSceneBorn（中間插入時 node view 被沿用、不重新掛載，
  // 靠通知才收得到）。
  //
  // ⚠️ 卸 class 走 animationend，**不用 setTimeout**：StrictMode 會把 effect 跑兩次
  // （run → cleanup → run），cleanup 清掉計時器後第二次已領不到（born 被消費掉），class 就永遠
  // 留著；同一個 node view 之後被沿用給另一場新生場次時，class 已在 → CSS 動畫不會重播。
  // 這就是使用者回饋 2026-09-03（兩輪）的「動畫有時候不會出現」。
  const [justBorn, setJustBorn] = useState(false);
  // 同一次誕生也決定捲動落點（票券 27）。狀態之外再留一支 ref：焦點串接要**同步**讀得到
  // 「這一場是剛生出來的嗎」（見下一個 effect），而 setState 要等下一次 render 才看得到。
  const bornForScroll = useRef(false);
  useEffect(() => {
    const claim = () => {
      if (consumeSceneBirth(sceneId)) {
        setJustBorn(true);
        bornForScroll.current = true;
      }
    };
    claim();
    return subscribeSceneBirth(claim);
  }, [sceneId]);

  /** 把游標送進本場第一個區塊的內文開頭（getPos → 場次前；+1 進場次、+1 進首區塊）。 */
  const enterBody = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos != null) editor.chain().focus().setTextSelection(pos + 2).run();
  };

  // 焦點串接（§7.7）是一次性的：建場 → requestFocus → 新 node view 消費掉。掛載時試領一次
  // （`/next` 的請求早於掛載），並訂閱後續請求（初次進編輯器時 `onCreate` 的請求晚於掛載）。
  useEffect(() => {
    const tryClaim = () => {
      if (!claimFocus((p) => p.kind === "sceneMeta" && p.sceneId === sceneId)) return;
      // 剛誕生的場次自己決定落點（打字餘裕，票券 27）—— 所以要擋掉 `focus()` 的原生捲動，
      // 否則瀏覽器先把它推到視窗底緣、我們再捲一次，看起來是跳兩下。
      // 不是新生場次（載入時的焦點串接，票券 26／31）就照原生行為捲進可視範圍。
      const born = bornForScroll.current;
      bornForScroll.current = false;
      firstField.current?.focus({ preventScroll: born });
      if (born) scrollToWritingPosition(firstField.current?.closest(".scene"));
    };
    tryClaim();
    return subscribeFocusRequest(tryClaim);
  }, [sceneId]);

  const spec: SceneNumberSpec | undefined = sceneNumberOf(
    decorations as unknown as readonly Decoration[],
  );
  const label = spec?.sceneNo ?? "?";

  const intExt = (node.attrs.intExt as string | null) ?? "";
  const time = (node.attrs.time as string | null) ?? "";
  const location = (node.attrs.location as SceneLocation) ?? null;

  return (
    <NodeViewWrapper
      className={[
        "scene",
        justBorn && "scene--just-added",
        spec?.selected && "is-node-selected",
        // 位置旗標走 decoration，不靠 :first-child／:last-child（見 extensions/scene-numbers）。
        spec?.isFirst && "scene--first",
        spec?.isLast && "scene--last",
      ]
        .filter(Boolean)
        .join(" ")}
      // 動畫播完就卸 class，下次再生時才能重播。reduced-motion 下 animation: none、事件不會來，
      // 但那時本來就沒有動畫可播，class 留著不影響外觀。
      onAnimationEnd={() => setJustBorn(false)}
    >
      {/* 場次號 decoration：gutter、不可編輯、不可 select、不吃指標事件（CSS 也再擋一層）。 */}
      <div className="scene__number" contentEditable={false} aria-hidden="true">
        {label}
      </div>

      {/* 內嵌簡表 —— 常駐。缺漏要看得出來（空 metadata → 自動草稿 → 匯出前被攔）。
          下拉比照 slash 選單外觀（ChipSelect），不用原生 <select>。 */}
      <div className="scene__chips" contentEditable={false} onKeyDown={swallowTab}>
        <span className={`scene__chip${intExt ? "" : " scene__chip--empty"}`}>
          <ChipSelect
            ref={firstField}
            className="scene__chip-control"
            placeholder="內外"
            value={intExt}
            options={INT_EXT_VALUES}
            onChange={(v) => updateAttributes({ intExt: v || null })}
          />
        </span>

        <span className={`scene__chip${time ? "" : " scene__chip--empty"}`}>
          <ChipSelect
            className="scene__chip-control"
            placeholder="時間"
            value={time}
            options={TIME_VALUES}
            onChange={(v) => updateAttributes({ time: v || null })}
          />
        </span>

        <span className={`scene__chip${location ? "" : " scene__chip--empty"}`}>
          <CjkField
            placeholder="地點"
            value={location?.displayName ?? ""}
            onCommit={(v) => {
              const name = v.trim();
              // 票券 04 尚無地點實體（票券 08）—— 先存無 id 的引用形狀。
              updateAttributes({ location: name ? { locationId: null, displayName: name } : null });
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.key !== "Tab") return;
              // 地點是 chip row 最後一格。正向 Tab：直接落進場次內文開始撰寫（不是跳到腳部按鈕，
              // 那顆已 tabIndex=-1）。反向 Tab：交給瀏覽器原生回到時間欄；BlockCycle 的攔截由外層
              // swallowTab 擋掉。§7.1 焦點串接。
              if (e.shiftKey) return;
              e.preventDefault();
              e.stopPropagation();
              enterBody();
            }}
          />
        </span>
      </div>

      <NodeViewContent className="scene__body" />

      {/* 場次之外沒有可點的空間，「新增下一場」按鈕住在腳部。滑鼠點的入口自己傳 sceneId。 */}
      <div className="scene__foot" contentEditable={false}>
        <button
          type="button"
          tabIndex={-1}
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

/** 重繪判斷：號碼、整場選取狀態或首尾位置變了才重繪這一場（不比整個 decoration 陣列）。 */
function sigOf(decorations: readonly Decoration[]): string {
  const spec = sceneNumberOf(decorations);
  return `${spec?.sceneNo ?? ""}:${spec?.selected ? 1 : 0}:${spec?.isFirst ? 1 : 0}${
    spec?.isLast ? 1 : 0
  }`;
}

export const SceneNode = Scene.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SceneView, {
      // SceneView 只畫 metadata（chip row）、場次號與整場選取狀態 —— 內文由 `NodeViewContent`
      // 交給 ProseMirror 直接維護，React 不必參與。所以「內文改了」（`oldNode !== newNode` 但
      // markup 相同）**不重繪**：否則場次裡打每一個字都會整棵 SceneView（兩個 select、CjkField、
      // 腳部按鈕）reconcile 一次，dev 疊上 StrictMode 雙跑會變成每鍵兩次無謂重繪。
      // 只有 attr（intExt／time／location／sceneId）或號碼／選取簽章變了才 `updateProps()`。§7.7。
      update: ({ oldNode, newNode, oldDecorations, newDecorations, updateProps }) => {
        if (oldNode.type !== newNode.type) return false;
        if (
          !oldNode.sameMarkup(newNode) ||
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
