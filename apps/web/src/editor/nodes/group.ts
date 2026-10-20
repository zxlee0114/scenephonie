/**
 * 場次群組與片段的 node view（票券 12、ADR-0004）—— 原生 ProseMirror node view，沒有 React 狀態
 * （同 `./blocks` 的動作／插入畫面：固定外殼 ＋ 一個內容洞就夠）。
 *
 * - **群組**：成員的 chip row 疊在上面、片段接在下面（都是內容洞裡的節點）；腳部的「＋ 新增下一場」
 *   接在**整個群組**之後 —— 群組裡的 `/next` 是「結束群組」，不是新增成員（§4.5）。
 * - **片段**：左側一個常駐標籤印它屬於哪個成員（場次號 ＋ 地點）。讓交錯看得見 —— 這正是美式寫法 A
 *   沒有、而我們有的東西（票券 15）。標籤是推導值，從 decoration 讀（`../extensions/scene-numbers`）：
 *   成員改了地點時片段節點一個字都沒變，只有 decoration 叫得動它。
 */
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";

import { requestNextScene } from "../extensions/next-scene";
import { fragmentLabelOf, type FragmentLabelSpec } from "../extensions/scene-numbers";
import { GroupFragment, SceneGroup } from "../schema";

/** 群組最後一個成員的 `sceneId` —— 「＋ 新增下一場」用它定址（滑鼠點的入口自己傳位置，§7.1）。 */
function lastMemberId(group: PMNode): string | null {
  let id: string | null = null;
  group.forEach((child) => {
    if (child.type.name === "groupMember") id = child.attrs.sceneId as string;
  });
  return id;
}

function groupView(editor: Editor, node: PMNode): NodeView {
  let current = node;

  const dom = document.createElement("section");
  dom.className = "scene-group";
  dom.dataset.type = "scene-group";

  const contentDOM = document.createElement("div");
  contentDOM.className = "scene-group__body";

  // 腳部與主場次的 `.scene__foot` 同一套外觀（虛線 ＋ hover 浮現的按鈕）。
  const foot = document.createElement("div");
  foot.className = "scene__foot";
  foot.contentEditable = "false";
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.textContent = "＋ 新增下一場";
  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    requestNextScene(editor, lastMemberId(current));
  });
  foot.append(button);

  dom.append(contentDOM, foot);
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== current.type) return false;
      current = next;
      return true;
    },
    // 腳部不是內容：它的事件與 DOM 變動不歸 ProseMirror 管。
    stopEvent: (event) => foot.contains(event.target as Node),
    ignoreMutation: (m) => !contentDOM.contains(m.target),
  };
}

function fragmentView(node: PMNode, decorations: readonly Decoration[]): NodeView {
  let current = node;

  const dom = document.createElement("section");
  dom.className = "group-fragment";
  dom.dataset.type = "group-fragment";

  // 不可編輯、不可選（§9 decoration 的三支撐）。號碼住 gutter、對齊場次號；地點是片段開頭的
  // 一行小字 —— 跟 PDF 交錯段落的歸屬標記同一個位置、同一串字（ADR-0004）。
  const label = document.createElement("div");
  label.className = "group-fragment__label";
  label.contentEditable = "false";
  label.setAttribute("aria-hidden", "true");
  const no = document.createElement("span");
  no.className = "group-fragment__no";
  const where = document.createElement("span");
  where.className = "group-fragment__where";
  label.append(no, where);

  const contentDOM = document.createElement("div");
  contentDOM.className = "group-fragment__body";

  const paint = (decos: readonly Decoration[]) => {
    const spec: FragmentLabelSpec | undefined = fragmentLabelOf(decos);
    no.textContent = spec?.memberNo ?? "";
    // 地點還沒填時說出來 —— 標籤的全部作用就是讓編劇知道自己在哪一邊。
    where.textContent = spec ? (spec.location ?? "地點未填") : "";
    where.classList.toggle("is-empty", !!spec && spec.location == null);
    label.title = spec ? `⌘${spec.memberOrdinal} 把片段切給這一場` : "";
    if (spec) dom.dataset.member = String(spec.memberOrdinal);
  };
  paint(decorations);

  dom.append(label, contentDOM);
  return {
    dom,
    contentDOM,
    update(next, decos) {
      if (next.type !== current.type) return false;
      current = next;
      paint(decos);
      return true;
    },
    ignoreMutation: (m) => !contentDOM.contains(m.target),
  };
}

export const SceneGroupNode = SceneGroup.extend({
  addNodeView() {
    return ({ editor, node }) => groupView(editor, node);
  },
});

export const GroupFragmentNode = GroupFragment.extend({
  addNodeView() {
    return ({ node, decorations }) =>
      fragmentView(node, decorations as unknown as readonly Decoration[]);
  },
});
