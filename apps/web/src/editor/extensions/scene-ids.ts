/**
 * 不變式 ⑥ —— 同一份 doc 內 `sceneId` 不得重複（§6.5）。
 *
 * 去重本體是 `@scenephonie/schema` 的 `dedupeIdsPlugin()`（appendTransaction、`addToHistory: false`，
 * 對任何來源都成立，是最後一道防線）。這裡多掛一個同性質的 plugin 補鑄**缺 id 的場次** ——
 * 我們的編輯器只透過 command 建場次（會鑄 id），但貼上、程式化插入、日後的匯入可能帶進
 * `sceneId == null` 的場次，`projectScenes`／讀取邊界都預期它恆有真值。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import {
  adoptExtrasPlugin,
  dedupeIdsPlugin,
  mintGroupId,
  mintSceneId,
  normalizeFragmentsPlugin,
} from "@scenephonie/schema";

import { forEachScene } from "../address";

const mintMissingKey = new PluginKey("scenephonie/mintMissingSceneIds");

export const SceneIds = Extension.create({
  name: "sceneIds",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: mintMissingKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = newState.tr;
          // 主場次、子場次與群組成員都帶 sceneId（票券 11／12）；區塊裡不會有場次，不必往下走。
          forEachScene(newState.doc, (node, offset) => {
            if (!node.attrs.sceneId) {
              tr.setNodeMarkup(offset, undefined, { ...node.attrs, sceneId: mintSceneId() });
            }
          });
          // 群組的 groupId 同一條規則（§6.5「完全相同處理」）。群組只在頂層。
          newState.doc.forEach((node, offset) => {
            if (node.type.name === "sceneGroup" && !node.attrs.groupId) {
              tr.setNodeMarkup(offset, undefined, { ...node.attrs, groupId: mintGroupId() });
            }
          });
          if (!tr.steps.length) return null;
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
      dedupeIdsPlugin(),
      // 片段的正規化（票券 12）：相鄰同成員的片段合併，同樣是模型的修復、不進 history。
      normalizeFragmentsPlugin(),
      // 對白帶著群演搬到別場（貼上、拖放）：群演定義跟著補進去（票券 13）。跟貼上同一步 ⌘Z。
      adoptExtrasPlugin(),
    ];
  },
});
