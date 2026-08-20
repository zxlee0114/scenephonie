// 「新增下一場」—— 建立場次的唯一動作。
//
// 文件是 `scene+`，場次之外沒有可編輯的空間，所以「建立容器」這個語意消失了，
// 剩下的只有序列動作：在當前這場後面再開一場。三個入口共用同一條路徑：
// 斜線選單的 /next、⌘+Enter、場次腳部的按鈕。
//
// 變體 C（漸進填寫）會攔截請求，先問完 metadata 再真的插入。

import type { Editor } from '@tiptap/core'
import { requestFocus } from './focus'

export const newSceneId = () => 'sc_' + Math.random().toString(36).slice(2, 7)

/** 游標所在場次的結束位置；不在任何場次裡就回 null。 */
export function afterCurrentScene(editor: Editor): number | null {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'scene') return $from.after(d)
  }
  return null
}

export type NextSceneRequest = { at: number }

/** 真的把場次插進去，並把游標送進第一個 metadata 欄位。 */
export function insertScene(
  editor: Editor,
  { at, attrs = {} }: NextSceneRequest & { attrs?: Record<string, unknown> },
) {
  const { state } = editor
  const sceneId = newSceneId()
  const node = state.schema.nodes.scene.create(
    { sceneId, characters: [], ...attrs },
    state.schema.nodes.action.create(),
  )
  requestFocus({ kind: 'sceneMeta', sceneId })
  editor.view.dispatch(state.tr.insert(at, node))
}

// ------------------------------------------------------- 攔截（給變體 C 用）

let intercept: ((req: NextSceneRequest) => void) | null = null

export function setNextSceneIntercept(fn: ((req: NextSceneRequest) => void) | null) {
  intercept = fn
}

/**
 * 所有入口都走這裡。
 *
 * `at` 一定要給得出來的入口就自己給 —— 場次腳部的按鈕是用滑鼠點的，游標還留在
 * 別的場次裡，靠 selection 推算會插到錯的地方。只有快捷鍵與斜線指令能靠游標。
 */
export function requestNextScene(editor: Editor, at?: number): boolean {
  const req = { at: at ?? afterCurrentScene(editor) ?? editor.state.doc.content.size }
  if (intercept) intercept(req)
  else insertScene(editor, req)
  return true
}
