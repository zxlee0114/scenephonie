/**
 * 實體改名時「還印著舊名的那幾場要不要跟上」的接線（票券 39）。
 *
 * 三個實體欄位（場次的地點欄、登場人物欄、對白的人物欄）各自掛在不同的 node view 上，但
 * 這件事對三者是同一件事：**數一遍 doc（projection），改一遍 doc（command）**。抄三份的話
 * 「什麼算還印著舊名」就有三個答案 —— 而它只該有一個。
 *
 * 目錄那一筆不在這裡：它走 server action、跨劇本，是另一個權威（見 `entity-field.tsx`
 * 的 `renameEntity`）。
 */
import type { Editor } from "@tiptap/core";

import { retitleEntityRefs } from "@scenephonie/schema";

import { runKernelCommand } from "./command-bridge";
import { scenesShowingName } from "./entity-usage";

/** `EntityField` 的 `retitleOthers` prop —— 綁在這個編輯器上。 */
export function retitleOthersIn(editor: Editor) {
  return {
    count: (id: string, name: string) => scenesShowingName(editor.state.doc, id, name),
    run: (id: string, from: string, to: string) =>
      runKernelCommand(editor, (doc) => retitleEntityRefs(doc, { entityId: id, from, to }), {
        keepFocus: true,
      }),
  };
}
