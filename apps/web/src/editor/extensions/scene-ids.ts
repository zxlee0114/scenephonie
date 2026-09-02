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

import { dedupeIdsPlugin, mintSceneId } from "@scenephonie/schema";

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
          newState.doc.forEach((node, offset) => {
            if (node.type.name === "scene" && !node.attrs.sceneId) {
              tr.setNodeMarkup(offset, undefined, { ...node.attrs, sceneId: mintSceneId() });
            }
          });
          if (!tr.steps.length) return null;
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
      dedupeIdsPlugin(),
    ];
  },
});
