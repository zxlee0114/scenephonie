/**
 * 折返標記 decoration —— 「回到 公寓客廳」（票券 11、§9.4、ADR-0006）。
 *
 * 機制與場次號相同：**推導值，不進資料模型**（「回到」與「以下對剪」「INS」同一位階，約束 2）。
 * 推導規則住在 kernel 的 `returnMarkers()`（日後 PDF 吃同一支）；這裡只把它畫在編輯器裡。
 * 只印在 PDF 會讓編劇跳出子場次後不知道自己在哪一層 —— 結構變了但畫面沒說。
 *
 * 畫成 widget、放在那個區塊**之前**：它是不可編輯、不可選的一行，不是區塊的一部分，所以不走
 * 區塊的 node view（那樣動作／插入畫面的原生 node view 就得為它長出 React 狀態）。印地點顯示名、
 * **不印場次號**；主場次還沒填地點時印「主場次」—— 那一刻要回答的仍然是「你回到哪一層了」。
 *
 * 群組（票券 12）的兩件模板產物也住這裡：片段裡的折返標記（回到的是那個片段的**成員**），以及
 * 成員與片段之間那一行「以下對剪」—— 四個字不進資料模型，是從「這是一個群組」推導出來的宣告。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

import { returnMarkers } from "@scenephonie/schema";

export const returnMarkersKey = new PluginKey("scenephonie/returnMarkers");

/** 「回到」與地點之間是一個全形空白（§9.4 的印法）。 */
export const returnMarkerText = (location: string | null) => `回到\u3000${location ?? "主場次"}`;

/** 「以下對剪」—— 美式寫法 A 的「先建立、再宣告、再交錯」裡那個宣告（ADR-0004）。 */
export const INTERCUT_MARKER = "以下對剪";

function markerDom(text: string, className = "return-marker"): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.contentEditable = "false";
  el.textContent = text;
  return el;
}

export function buildReturnMarkers(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  /** 一段內容（主場次或片段）裡的折返標記；地點取自 `owner`（片段的話是它的成員）。 */
  const markContainer = (container: PMNode, containerPos: number, owner: PMNode) => {
    const offsets: number[] = [];
    container.forEach((_child, offset) => offsets.push(offset));
    for (const marker of returnMarkers(container, owner)) {
      const text = returnMarkerText(marker.location);
      const at = containerPos + 1 + offsets[marker.blockIndex]!;
      // key 帶著文字：地點改名時換一個 DOM，沒變就沿用（不閃）。
      decos.push(
        Decoration.widget(at, () => markerDom(text), {
          side: -1,
          key: `return:${text}`,
          ignoreSelection: true,
        }),
      );
    }
  };

  doc.forEach((top, topPos) => {
    if (top.type.name === "scene") {
      markContainer(top, topPos, top);
      return;
    }
    if (top.type.name !== "sceneGroup") return;
    const members = new Map<string, PMNode>();
    let declared = false;
    top.forEach((child, offset) => {
      if (child.type.name === "groupMember") {
        members.set(child.attrs.sceneId as string, child);
        return;
      }
      const at = topPos + 1 + offset;
      if (!declared) {
        declared = true;
        decos.push(
          Decoration.widget(at, () => markerDom(INTERCUT_MARKER, "intercut-marker"), {
            side: -1,
            key: "intercut",
            ignoreSelection: true,
          }),
        );
      }
      const owner = members.get(child.attrs.memberId as string);
      if (owner) markContainer(child, at, owner);
    });
  });
  return DecorationSet.create(doc, decos);
}

export const ReturnMarkers = Extension.create({
  name: "returnMarkers",
  addProseMirrorPlugins() {
    let cache: { doc: PMNode; set: DecorationSet } | null = null;
    return [
      new Plugin({
        key: returnMarkersKey,
        props: {
          decorations: (state) => {
            if (cache?.doc === state.doc) return cache.set;
            cache = { doc: state.doc, set: buildReturnMarkers(state.doc) };
            return cache.set;
          },
        },
      }),
    ];
  },
});
