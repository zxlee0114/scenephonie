/**
 * 走出子場次、回到主場次 —— `/back-to` 與「雙 Enter」共用的手勢（票券 11、§7.1、ADR-0006）。
 *
 * **不建立任何東西**：沒有新場次、沒有新身分，所以它不是 kernel command（§6.3 准入判準：
 * 不強制不變式、也不以 id 定址 —— 它是以位置定址的純手勢）。它做的只是把游標放到「這個子場次
 * 之後、主場次自己的那一行」：
 *
 * - 游標站著的區塊是空的、而且子場次還有別的區塊 → 那一行本來就是要拿來打指令／按 Enter 的，
 *   把它收掉（ProseMirror 的 `liftEmptyBlock` 語意：空區塊提升出去）；
 * - 子場次後面緊接著一個空的動作區塊 → 游標就去那裡，不再多開一行；
 * - 否則在子場次之後開一個空的動作區塊。
 *
 * 那一行是空的，所以折返標記（「回到 公寓客廳」）此刻**不會出現** —— 空區塊不算內容。打了字
 * 它才出現；改打 `/continue-to` 的話它從頭到尾沒出現過，畫面不會自己閃一下（§9.4）。
 */
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";

import { sceneContext } from "../address";

/** 游標所在的子場次（depth）；不在子場次裡回 `null`。 */
export function subsceneDepth($pos: ResolvedPos): number | null {
  const ctx = sceneContext($pos);
  if (!ctx || $pos.node(ctx.sceneDepth).type.name !== "subscene") return null;
  return ctx.sceneDepth;
}

/**
 * 雙 Enter 的判準：游標在子場次**最後一個**區塊、那個區塊是空的、而且子場次不只這一個區塊
 * （子場次是 `sceneBlock+`，不能被掏空）。
 */
export function canLiftEmptyBlock($from: ResolvedPos): boolean {
  const depth = subsceneDepth($from);
  if (depth == null) return false;
  const sub = $from.node(depth);
  return (
    $from.parent.content.size === 0 &&
    sub.childCount > 1 &&
    $from.index(depth) === sub.childCount - 1
  );
}

/** 走出子場次。不在子場次裡回 `false`（什麼都不做）。 */
export function exitSubscene(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  const depth = subsceneDepth($from);
  if (depth == null) return false;

  const sub = $from.node(depth);
  const subEnd = $from.after(depth);
  const parent = $from.node(depth - 1);
  const next = parent.maybeChild($from.index(depth - 1) + 1);

  const tr = state.tr;
  if ($from.parent.content.size === 0 && sub.childCount > 1) {
    tr.delete($from.before(), $from.after());
  }
  const at = tr.mapping.map(subEnd);
  if (!(next && next.type.name === "action" && next.content.size === 0)) {
    tr.insert(at, state.schema.nodes.action!.create());
  }
  tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
  view.dispatch(tr);
  return true;
}
