import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";

/**
 * 一份只有一個空場次的 doc（ProseMirror JSON）。
 *
 * schema 是 `scene*`（可為空），「劇本至少有一場」是編輯器的責任、不是 schema 能表達的
 * 不變式（見 kernel schema.ts 註解／§5.1）。放在這裡而不是 `use-screenplay-editor.ts`，
 * 是因為建立新劇本發生在伺服器端 —— 這個檔案沒有瀏覽器相依，兩邊都用得起。
 */
export function emptyScreenplay(): Record<string, unknown> {
  return kernelSchema
    .node("doc", null, [
      kernelSchema.node("scene", { sceneId: mintSceneId() }, kernelSchema.node("action", null, [])),
    ])
    .toJSON() as Record<string, unknown>;
}
