/**
 * 唯讀分享頁的內容（票券 20，§10、§7.10）—— 劇本與場次表是**同一個 share 的兩個視圖**。
 *
 * **沿用編輯器的閱讀呈現，不是 PDF 預覽**（不變式 G 的後果）：分享頁若給 GHSA 版面，等於從後門把
 * 輸出格式塞回螢幕。區塊沿用編輯器的 class（行長、對白縮排、插入畫面的標籤、折返標記），只是沒有
 * 任何一處可以編輯。
 *
 * **只讀交付投影**（不變式 E）：即時分享也是當場推導的那一份，所以草稿從來不在這裡、場次號是交付的
 * 那一個，這個元件不重算任何語意推導值，只決定畫成什麼樣子。
 *
 * 場次導覽沿用同一個 `SceneNav`，依 delivery context 重建：沒有草稿、**高亮跟隨閱讀位置**（分享頁沒有
 * 游標）、篩選照舊。
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  deliveredSceneTable,
  type DeliveredScene,
  type DeliveryPayload,
  type ScriptElement,
} from "@scenephonie/schema";

import { SceneNav } from "@/scene-nav/SceneNav";
import { deliveredNavRows } from "@/scene-nav/rows";
import { SceneTable } from "@/scene-table/SceneTable";

import "../styles/editor.css";
import "../styles/share.css";

export type SharedView = "script" | "table";

export function SharedScreenplay({
  payload,
  view,
  onShowScript,
}: {
  payload: DeliveryPayload;
  view: SharedView;
  /** 場次表上點了一列：請路由切回劇本。定位到那一場由這裡負責（切回來之後）。 */
  onShowScript: () => void;
}) {
  const scenes = useMemo(() => new Map(payload.scenes.map((s) => [s.sceneId, s])), [payload]);
  const navRows = useMemo(() => deliveredNavRows(payload), [payload]);
  const tableRows = useMemo(() => deliveredSceneTable(payload), [payload]);
  const page = useRef<HTMLElement>(null);
  const reading = useReadingPosition(page, view === "script");
  /**
   * sidebar 只在 client 畫：它的開合偏好讀 localStorage／matchMedia（`useSceneNavOpen` 的合約）。編輯器
   * 頁靠「編輯器只在 client 建」守住這一條；分享頁的稿子是伺服器就畫好的，所以等掛載之後才畫它。
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  /** 場次表上點的那一列 —— 等劇本顯示出來再捲過去（藏著的元素捲不動）。 */
  const pendingReveal = useRef<string | null>(null);

  // 場次的第一個標記（標題；對剪成員之後還有片段標記，跳到標題）。
  const reveal = (sceneId: string) =>
    [...(page.current?.querySelectorAll<HTMLElement>("[data-scene-id]") ?? [])]
      .find((marker) => marker.dataset.sceneId === sceneId)
      ?.scrollIntoView({ block: "start" });

  useEffect(() => {
    if (view !== "script" || !pendingReveal.current) return;
    reveal(pendingReveal.current);
    pendingReveal.current = null;
  }, [view]);

  return (
    <>
      <div className="screenplay-body">
        {view === "script" && mounted && <SceneNav rows={navRows} currentSceneId={reading} onSelect={reveal} />}
        <article ref={page} className="screenplay-page shared-script" aria-label="劇本" hidden={view !== "script"}>
          {payload.script.map((element, i) => (
            <Element key={i} element={element} scenes={scenes} />
          ))}
        </article>
      </div>
      {view === "table" && (
        <SceneTable
          rows={tableRows}
          anchorSceneId={null}
          onSelect={(sceneId) => {
            pendingReveal.current = sceneId;
            onShowScript();
          }}
        />
      )}
    </>
  );
}

/**
 * 讀者讀到哪一場：視窗上緣往下一點點那條線上、最後一個越過它的場次標記（標題或片段標記）。
 * 沒有任何一個越過就是 `null`（還在第一場之前）。
 */
function useReadingPosition(page: React.RefObject<HTMLElement | null>, active: boolean): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.25;
      let found: string | null = null;
      for (const marker of page.current?.querySelectorAll<HTMLElement>("[data-scene-id]") ?? []) {
        if (marker.getBoundingClientRect().top > line) break;
        found = marker.dataset.sceneId ?? null;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [page, active]);
  return current;
}

function Element({ element, scenes }: { element: ScriptElement; scenes: ReadonlyMap<string, DeliveredScene> }) {
  switch (element.type) {
    case "heading": {
      const scene = scenes.get(element.sceneId);
      if (!scene) return null;
      const people = scene.appearingCharacters.map((r) => r.displayName).join("、");
      return (
        <header
          className={`shared-script__scene${scene.parentSceneId ? " shared-script__scene--sub" : ""}`}
          data-scene-id={scene.sceneId}
        >
          <h2 className="shared-script__heading">
            <span className="shared-script__no">S{scene.label}</span>
            <span className="shared-script__meta">{scene.intExt}</span>
            <span className="shared-script__meta">{scene.time}</span>
            <span className="shared-script__meta">{scene.locations.map((r) => r.displayName).join("、")}</span>
          </h2>
          {(people || scene.extras) && (
            <p className="shared-script__people">{[people, scene.extras].filter(Boolean).join("、")}</p>
          )}
        </header>
      );
    }
    case "action":
      return <p className="block--action shared-script__block">{element.text}</p>;
    case "dialogue": {
      const voice = element.voiceStyle === "一般" ? "" : `（${element.voiceStyle}）`;
      return (
        <div className="block--dialogue shared-script__block">
          {element.speaker !== null && <p className="shared-script__speaker">{element.speaker + voice}</p>}
          <p>{element.text}</p>
        </div>
      );
    }
    case "insertShot":
      return (
        <div className="block--insert-shot shared-script__block">
          <span className="block__tag">插入畫面</span>
          <p>{element.text}</p>
        </div>
      );
    case "returnTo":
      return <p className="return-marker">{"回到　" + placeOf(element, scenes)}</p>;
    case "intercut":
      return <p className="shared-script__intercut">以下對剪</p>;
    case "fragment": {
      // 補印哪幾欄是交付算好的（`disambiguateBy`），這裡只把那幾欄的值放進括號。
      const scene = scenes.get(element.sceneId);
      const extra = scene ? element.disambiguateBy.map((field) => scene[field]).join(" ") : "";
      return (
        <p className="return-marker shared-script__fragment" data-scene-id={element.sceneId}>
          {placeOf(element, scenes)}
          {extra && `（${extra}）`}
        </p>
      );
    }
    default:
      return null;
  }
}

/** 折返與片段標記上的「哪裡」：雜景可以沒有地點，那時說那一場的內外（同 PDF）。 */
function placeOf(element: { sceneId: string; location: string | null }, scenes: ReadonlyMap<string, DeliveredScene>) {
  return element.location ?? scenes.get(element.sceneId)?.intExt ?? "";
}
