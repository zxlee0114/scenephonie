/**
 * 場次表（票券 15，§8）—— 交付用的投影：零新增資訊、給製作端、可印。
 *
 * 這個元件只負責**畫**：列由呼叫端從 `projectSceneTable` ＋ `labelSceneTable` 推導好交進來。
 * **沒有寫入路徑** —— 要改就回頭改 doc（點一列開預覽，從預覽跳回編輯器），所以格子都是純文字。
 * `missingRefs` 不進這裡：它是診斷輸出，不參與渲染（§6.6）。
 */
"use client";

import type { LabeledSceneTableRow } from "@scenephonie/schema";
import { useEffect, useMemo, useRef, useState } from "react";

import { filterSceneTable } from "./filter";

export function SceneTable({
  rows,
  anchorSceneId,
  onSelect,
}: {
  rows: readonly LabeledSceneTableRow[];
  /** 切換進來時對位的那一列（游標所在場次，§7.10）；`null` ＝ 不對位。 */
  anchorSceneId: string | null;
  /** 點一列：開那一場的預覽（呼叫端決定怎麼呈現）。 */
  onSelect: (sceneId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterSceneTable(rows, query), [rows, query]);
  const anchorRef = useRef<HTMLTableRowElement>(null);

  // 只在切換進來的那一刻對位；之後的捲動是讀者自己的。
  useEffect(() => {
    anchorRef.current?.scrollIntoView?.({ block: "center" });
  }, []);

  return (
    <section className="scene-table" aria-label="場次表">
      <input
        type="search"
        className="scene-table__search"
        placeholder="篩選：場次號、景、時間、地點、人物、群演"
        aria-label="篩選場次"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* 窄螢幕放不下六欄：只有表自己橫捲，頁面不出 x 軸。 */}
      <div className="scene-table__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">場次</th>
              <th scope="col">景</th>
              <th scope="col">光</th>
              {/* 業界順場表此欄名為「場景」，本專案輸出時一律標為「地點」（ADR-0001）。 */}
              <th scope="col">地點</th>
              <th scope="col">登場人物</th>
              <th scope="col">群演</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const anchored = row.sceneId === anchorSceneId;
              return (
                <tr
                  key={row.sceneId}
                  ref={anchored ? anchorRef : undefined}
                  data-scene-id={row.sceneId}
                  aria-current={anchored ? "location" : undefined}
                  className={row.parentSceneId ? "scene-table__row--sub" : undefined}
                  onClick={() => onSelect(row.sceneId)}
                >
                  <td>
                    {/* 鍵盤也點得到：整列可點，但 Tab 只停在場次號這一格。 */}
                    <button type="button" className="scene-table__open">
                      {row.label}
                    </button>
                  </td>
                  <td>{row.intExt}</td>
                  <td>{row.time}</td>
                  <td>{row.location}</td>
                  <td>{row.appearingCharacters}</td>
                  <td>{row.extras}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
