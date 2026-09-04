import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";

import { toPlainJson } from "./plain-json";

/**
 * 一份只有一個空場次的 doc（ProseMirror JSON）。
 *
 * schema 是 `scene*`（可為空），「劇本至少有一場」是編輯器的責任、不是 schema 能表達的
 * 不變式（見 kernel schema.ts 註解／§5.1）。放在這裡而不是 `use-screenplay-editor.ts`，
 * 是因為建立新劇本發生在伺服器端 —— 這個檔案沒有瀏覽器相依，兩邊都用得起。
 *
 * 回傳前一定要走 `toPlainJson`：kernel 的 `toJSON()` 產出 null-prototype 的 attrs，而這份 doc
 * 生來就是要跨 RSC 邊界的（伺服器建立 → 交給 client component 當 initialContent）。React 對
 * null-prototype 的兩個方向處置不同、都不能忍：server→client 直接丟
 * 「Only plain objects … can be passed to Client Components」；client→server 更糟，靜默換成
 * temporary reference 把 attr 全吃掉。理由與細節見 ./plain-json.ts。
 */
export function emptyScreenplay(): Record<string, unknown> {
  return toPlainJson(
    kernelSchema
      .node("doc", null, [
        kernelSchema.node("scene", { sceneId: mintSceneId() }, kernelSchema.node("action", null, [])),
      ])
      .toJSON() as Record<string, unknown>,
  );
}
