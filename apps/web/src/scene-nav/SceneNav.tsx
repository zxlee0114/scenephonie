/**
 * 場次導覽 sidebar（票券 16，§7.10）—— **創作中的定位**：跟隨游標高亮、含草稿、只為了跳。
 * 與「文件 sidebar」是兩回事（導覽仍是純 routes ＋ hub）。
 *
 * 這個元件只負責**畫**：列由呼叫端推導好交進來（`sceneNavRows`），點一列做什麼也由呼叫端決定。
 * 開合與篩選是 sidebar 自己的事（`useSceneNavOpen`、`filterScenes`）。
 *
 * **v1 不做**：全文搜尋（另一個量級，§3.3）、focus mode、chip row 的 global collapse（收 sidebar
 * 已吃掉絕大部分需求；後者直接踩 §7.11「缺漏不可被預設 UI 隱藏」）。
 */
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { filterScenes } from "@/scene-table/filter";

import type { SceneNavRow } from "./rows";
import { useSceneNavOpen } from "./use-scene-nav-open";

export function SceneNav({
  rows,
  currentSceneId,
  onSelect,
}: {
  rows: readonly SceneNavRow[];
  /** 游標所在的那一場 —— 高亮跟著它走；不在任何一場裡是 `null`。 */
  currentSceneId: string | null;
  /** 點了一列。 */
  onSelect: (sceneId: string) => void;
}) {
  const { open, wide, setOpen } = useSceneNavOpen();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterScenes(rows, query, (row) => row.search), [rows, query]);
  const bodyId = useId();
  const currentRef = useRef<HTMLButtonElement>(null);

  // 130 場時目前那一列常在 sidebar 的可視範圍外 —— 游標換場、或剛打開時把它帶進來，但只捲到
  // 剛好看得見，不把清單整個拉到中間（編劇是在寫字，不是在看清單）。
  useEffect(() => {
    if (open) currentRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentSceneId, open]);

  // 窄螢幕的抽屜蓋在稿子上：Esc 收回去，同其他浮層。
  useEffect(() => {
    if (wide || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wide, open, setOpen]);

  const item = (row: SceneNavRow) => {
    const current = row.sceneId === currentSceneId;
    return (
      <li
        key={row.sceneId}
        data-scene-id={row.sceneId}
        className={["scene-nav__item", row.sub && "scene-nav__item--sub", row.draft && "scene-nav__item--draft"]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          ref={current ? currentRef : undefined}
          className="scene-nav__row"
          aria-current={current ? "location" : undefined}
          onClick={() => {
            onSelect(row.sceneId);
            // 抽屜是為了這一跳才叫出來的 —— 跳到了就收回去，讓出稿子。
            if (!wide) setOpen(false);
          }}
        >
          <SceneNavLine row={row} />
        </button>
      </li>
    );
  };

  return (
    <nav
      className={`scene-nav${open ? " scene-nav--open" : ""}${wide ? "" : " scene-nav--drawer"}`}
      aria-label="場次導覽"
    >
      <button
        type="button"
        className="scene-nav__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{open ? "‹" : "›"}</span> 場次
      </button>
      {open && !wide && (
        // 點稿子那一側收回抽屜。不是按鈕：鍵盤用 Esc 或同一顆開關。
        <div className="scene-nav__scrim" aria-hidden="true" onClick={() => setOpen(false)} />
      )}
      {open && (
        <div className="scene-nav__body" id={bodyId}>
          <input
            type="search"
            className="scene-nav__search"
            placeholder="篩選：場次號、地點、人物、時間"
            aria-label="篩選場次"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {shown.length === 0 && rows.length > 0 ? (
            <p className="scene-nav__empty">沒有對得上的場次</p>
          ) : (
            <ol className="scene-nav__list">
              {runs(shown).map((run) =>
                // 群組本身不佔一列（它不佔號）—— 但成員要看得出同組：收進同一條框線裡。
                run.groupId ? (
                  <li key={run.groupId + run.rows[0]!.sceneId} className="scene-nav__group">
                    <ol role="group" aria-label="對剪">
                      {run.rows.map(item)}
                    </ol>
                  </li>
                ) : (
                  run.rows.map(item)
                ),
              )}
            </ol>
          )}
        </div>
      )}
    </nav>
  );
}

/** 把連續的同組列收成一段；不在群組裡的列各自一段（`groupId` 為 `undefined`）。 */
function runs(rows: readonly SceneNavRow[]): { groupId?: string; rows: SceneNavRow[] }[] {
  const out: { groupId?: string; rows: SceneNavRow[] }[] = [];
  for (const row of rows) {
    const last = out.at(-1);
    if (last && row.groupId && last.groupId === row.groupId) last.rows.push(row);
    else out.push({ ...(row.groupId ? { groupId: row.groupId } : {}), rows: [row] });
  }
  return out;
}

/**
 * 一列的四格：`S1｜內｜日｜廚房`。格子固定四個、空的也留著 —— 列與列之間的欄才對得齊（草稿常常
 * 還沒填）。
 */
function SceneNavLine({ row }: { row: SceneNavRow }) {
  return (
    <>
      <span className="scene-nav__no">{row.label}</span>
      {/* 看得見的區隔是場次號換成草稿色（同 gutter）；`S1[D1]` 的 `D` 不是人人讀得懂，唸出來要說。 */}
      {row.draft && <span className="scene-nav__draft sr-only">草稿</span>}
      <span className="scene-nav__int-ext">{row.intExt}</span>
      <span className="scene-nav__time">{row.time}</span>
      <span className="scene-nav__location">{row.location}</span>
    </>
  );
}
