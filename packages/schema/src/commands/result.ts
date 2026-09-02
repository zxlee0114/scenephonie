/**
 * domain command 的回傳型別。
 *
 * command 是**純函式，吃 doc 吐 doc**（規格 §6.3、[ADR-0007](../../../../docs/adr/0007-document-as-single-authority.md)）。
 * 非法輸入**回傳 `{ ok: false, reason }`，不 throw** —— 呼叫端（編輯器、伺服器端
 * route handler、日後的 API）都要能把「模型拒絕了這個意圖」與「程式炸了」分開處理。
 *
 * 這條直接對上 `moveScene` 那條驗收：非法目標由 command 自己拒絕，不靠 UI 擋
 * （UI 的落點線只擋得住滑鼠，擋不住伺服器端呼叫）。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

export type CommandResult<T = ProseMirrorNode> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function ok<T>(value: T): CommandResult<T> {
  return { ok: true, value };
}

export function reject<T = ProseMirrorNode>(reason: string): CommandResult<T> {
  return { ok: false, reason };
}
