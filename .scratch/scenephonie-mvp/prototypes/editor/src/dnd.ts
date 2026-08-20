// 拖曳排序 —— 場次之間，以及區塊跨場次。
//
// 刻意不走 ProseMirror 內建的拖放：場次是 isolating，內建行為會擋掉跨場次搬區塊。
// 而 isolating 要留著 —— 它保護的是鍵盤選取、刪除與貼上，那些才是會誤傷 sceneId
// 錨點的路徑。拖曳是明確的使用者意圖，不是誤觸，所以自己算落點、自己送 transaction。
//
// 注意：拖曳排序在地圖上仍屬 Out of scope，這裡做出來只是為了讓作者用手感判斷。

import { useSyncExternalStore, type DragEvent } from 'react'
import type { Editor } from '@tiptap/core'

export type DragKind = 'scene' | 'block'
export type DragPayload = { kind: DragKind; pos: number; nodeSize: number }
export type DropSide = 'before' | 'after'

let payload: DragPayload | null = null
export const isDragging = () => payload !== null

// 落點指示線。全域只有一條 —— 每個節點各自存 React state 會留下清不掉的殘影。
let target: { pos: number; side: DropSide } | null = null
const listeners = new Set<() => void>()

function setTarget(next: typeof target) {
  if (next?.pos === target?.pos && next?.side === target?.side) return
  target = next
  listeners.forEach((l) => l())
}

function endDrag() {
  payload = null
  setTarget(null)
}

/**
 * 把手住在 contentEditable 裡面，所以 ProseMirror 掛在 .ProseMirror 上的原生
 * dragstart／drop 監聽器會**比 React handler 先跑**（React 把事件委派到 root，
 * 那是 .ProseMirror 的祖先）。回傳 true 等於告訴 PM「這場拖曳我們接手了」。
 *
 * dragstart 時我們自己的 React handler 還沒跑，payload 還是空的，所以改認把手本身。
 */
export const dragGuardDOMEvents = {
  dragstart: (_view: unknown, e: Event) =>
    !!(e.target as HTMLElement | null)?.closest?.('.drag-handle'),
  dragover: () => isDragging(),
  drop: () => isDragging(),
}

/**
 * 把 from 的節點搬到 to（節點之間的插入點）。
 *
 * 區塊被搬走後，來源場次可能一個區塊都不剩，違反 `sceneBlock+`。
 * 這時不刪、改成換上一個空的動作區塊 —— 場次留在原地，只是空了。
 */
export function moveNode(editor: Editor, from: number, to: number) {
  const { state } = editor
  const node = state.doc.nodeAt(from)
  if (!node) return
  const end = from + node.nodeSize
  if (to >= from && to <= end) return // 拖回自己身上

  const $from = state.doc.resolve(from)
  const lastOne = node.type.name !== 'scene' && $from.parent.childCount === 1

  const tr = lastOne
    ? state.tr.replaceWith(from, end, state.schema.nodes.action.create())
    : state.tr.delete(from, end)

  editor.view.dispatch(tr.insert(tr.mapping.map(to), node))
}

const sideOf = (e: DragEvent): DropSide => {
  const r = e.currentTarget.getBoundingClientRect()
  return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
}

/**
 * 落點偵測。只接受同一種 kind —— 場次不能掉進區塊之間，區塊也不能掉到場次之間。
 *
 * drop 時的落點**從事件重算**，不讀指示線的狀態：滑鼠在節點內部從一個子元素移到
 * 另一個就會發一次 dragleave，狀態被清成 null。以前讀狀態的版本會在那個空窗提早
 * return 且沒有 preventDefault，於是瀏覽器執行預設放置 —— 把內容插進 contenteditable
 * 再刪掉來源，症狀就是吃字、跑版、偶爾拖不動。
 */
export function useDropZone(editor: Editor, kind: DragKind, pos: number | null, nodeSize: number) {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => target,
  )

  const accepts = () => !!payload && payload.kind === kind && pos !== null && pos !== payload.pos

  return {
    over: current?.pos === pos ? current.side : null,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        if (!accepts()) return
        e.preventDefault()
        e.stopPropagation()
        setTarget({ pos: pos!, side: sideOf(e) })
      },
      onDrop: (e: DragEvent) => {
        if (!accepts()) return
        // 先攔下瀏覽器的預設放置，再決定要不要搬 —— 順序不能反
        e.preventDefault()
        e.stopPropagation()
        const side = sideOf(e)
        moveNode(editor, payload!.pos, side === 'before' ? pos! : pos! + nodeSize)
        endDrag()
      },
    },
  }
}

/** 拖曳把手要掛的事件。把手本身必須 contentEditable={false}，否則會被當成內容。 */
export function dragProps(kind: DragKind, pos: number | null, nodeSize: number) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      if (pos === null) return
      e.dataTransfer.effectAllowed = 'move'
      // Firefox 不設 data 就不會啟動拖曳
      e.dataTransfer.setData('text/plain', '')
      payload = { kind, pos, nodeSize }
    },
    onDragEnd: endDrag,
  }
}
