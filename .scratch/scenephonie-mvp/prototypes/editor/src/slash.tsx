// Notion 式的斜線選單。
//
// 只有「新增下一場」真的需要斜線指令。動作與對白之間的切換走 Tab ——
// 那兩者在寫作時交替太頻繁，每次打指令會毀掉心流。斜線選單裡仍列出它們，
// 但那是給「忘記快捷鍵的人」的後路，不是主要路徑。
//
// 指令叫 /next 而不是 /scene：文件是 `scene+`，你永遠在某個場次裡打字，
// 「在場次裡建立場次」語意上很怪。真正的動作是序列性的 —— 再開下一場。

import { useSyncExternalStore } from 'react'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { Editor, Range } from '@tiptap/core'
import { requestFocus } from './focus'
import { requestNextScene } from './next-scene'

export type SlashItem = {
  key: string
  label: string
  hint: string
  run: (editor: Editor, range: Range) => void
}

const BLOCK_TYPES = ['action', 'dialogue', 'insertShot']

function nextScene(editor: Editor, range: Range) {
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to))
  requestNextScene(editor)
}

function convertBlock(editor: Editor, range: Range, typeName: string) {
  const { state } = editor
  const $from = state.doc.resolve(range.from)
  if (!BLOCK_TYPES.includes($from.parent.type.name)) return

  const pos = $from.before()
  let tr = state.tr.delete(range.from, range.to)
  const mapped = tr.mapping.map(pos)
  tr = tr.setNodeMarkup(
    mapped,
    state.schema.nodes[typeName],
    typeName === 'dialogue' ? { character: '' } : {},
  )
  if (typeName === 'dialogue') requestFocus({ kind: 'character', pos: mapped })
  editor.view.dispatch(tr)
}

const ITEMS: SlashItem[] = [
  {
    key: 'next',
    label: '新增下一場',
    hint: '時間或地點一變就是新的一場（⌘+Enter）',
    run: (e, r) => nextScene(e, r),
  },
  {
    key: 'shot',
    label: '插入鏡頭',
    hint: '場次內部的單一鏡頭，不產生新場次',
    run: (e, r) => convertBlock(e, r, 'insertShot'),
  },
  { key: 'dialogue', label: '對白', hint: '也可以按 Tab 切換', run: (e, r) => convertBlock(e, r, 'dialogue') },
  { key: 'action', label: '動作', hint: '也可以按 Tab 切換', run: (e, r) => convertBlock(e, r, 'action') },
]

// ---------------------------------------------------------------- 選單狀態

type MenuState = { open: boolean; items: SlashItem[]; index: number; rect: DOMRect | null }

let menu: MenuState = { open: false, items: [], index: 0, rect: null }
let pick: ((item: SlashItem) => void) | null = null
const listeners = new Set<() => void>()

const set = (next: Partial<MenuState>) => {
  menu = { ...menu, ...next }
  listeners.forEach((l) => l())
}

export function SlashMenu() {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => menu,
  )

  if (!s.open || !s.rect || !s.items.length) return null

  return (
    <div className="slash-menu" style={{ top: s.rect.bottom + 6, left: s.rect.left }}>
      {s.items.map((item, i) => (
        <button
          key={item.key}
          className={i === s.index ? 'on' : ''}
          onMouseEnter={() => set({ index: i })}
          onMouseDown={(e) => {
            e.preventDefault()
            pick?.(item)
          }}
        >
          <strong>{item.label}</strong>
          <span>{item.hint}</span>
        </button>
      ))}
    </div>
  )
}

export const Slash = Extension.create({
  name: 'slash',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase()
          return ITEMS.filter((i) => i.key.startsWith(q) || i.label.includes(query))
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => {
            pick = (item) => props.command(item)
            set({ open: true, items: props.items, index: 0, rect: props.clientRect?.() ?? null })
          },
          onUpdate: (props) => {
            set({ items: props.items, index: 0, rect: props.clientRect?.() ?? null })
          },
          onKeyDown: ({ event }) => {
            if (!menu.open) return false
            if (event.key === 'Escape') {
              set({ open: false })
              return true
            }
            if (event.key === 'ArrowDown') {
              set({ index: (menu.index + 1) % menu.items.length })
              return true
            }
            if (event.key === 'ArrowUp') {
              set({ index: (menu.index - 1 + menu.items.length) % menu.items.length })
              return true
            }
            if (event.key === 'Enter') {
              const item = menu.items[menu.index]
              if (item) pick?.(item)
              return true
            }
            return false
          },
          onExit: () => {
            pick = null
            set({ open: false, items: [], rect: null })
          },
        }),
      }),
    ]
  },
})
