// 點場次號開的選單 —— 場次層級的動作全部收在這一個入口。
//
// 搬移放第一個、對調放第二個：搬移才是日常操作（把這一場往後挪），
// 對調是「這兩場寫反了」這種罕見情況。兩者結果完全不同，別混為一談。

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { moveNode } from './dnd'
import type { SceneRow } from './numbering'

const SKIP_CONFIRM_KEY = 'scenephonie:skip-delete-confirm'

type Mode = 'root' | 'move' | 'swap'

export function SceneMenu({
  editor,
  row,
  rows,
  onClose,
}: {
  editor: Editor
  row: SceneRow
  rows: SceneRow[]
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>('root')
  const [filter, setFilter] = useState('')
  const [confirming, setConfirming] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // 選單開在場次標頭下方，靠近視窗邊緣時要翻邊，否則會被切掉
  const [flip, setFlip] = useState({ x: false, y: false })

  useEffect(() => {
    const r = rootRef.current?.getBoundingClientRect()
    if (r) setFlip({ x: r.right > innerWidth - 8, y: r.bottom > innerHeight - 8 })
  }, [mode])

  // 點選單以外的地方就收起來。用 rAF 延後掛載，否則「開啟選單」那一次
  // pointerdown 會立刻把它關掉。
  useEffect(() => {
    if (confirming) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const id = requestAnimationFrame(() => document.addEventListener('pointerdown', onDown))
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [confirming, onClose])

  const cls = `scene-menu${flip.x ? ' flip-x' : ''}${flip.y ? ' flip-y' : ''}`
  const others = rows.filter((r) => r.pos !== row.pos)
  const onlyScene = rows.length === 1

  const remove = () => {
    editor.view.dispatch(editor.state.tr.delete(row.pos, row.pos + row.nodeSize))
    onClose()
  }

  const askRemove = () => {
    if (localStorage.getItem(SKIP_CONFIRM_KEY) === '1') remove()
    else setConfirming(true)
  }

  /** 搬到目標場次的位置，其餘遞補 —— 跟拖曳同一個語意。 */
  const moveTo = (target: SceneRow) => {
    const to = row.pos < target.pos ? target.pos + target.nodeSize : target.pos
    moveNode(editor, row.pos, to)
    onClose()
  }

  /** 兩場互換，其餘不動。先動位置靠後的那一場，前面的位置才不會被打亂。 */
  const swapWith = (target: SceneRow) => {
    const { state } = editor
    const [a, b] = row.pos < target.pos ? [row, target] : [target, row]
    const nodeA = state.doc.nodeAt(a.pos)
    const nodeB = state.doc.nodeAt(b.pos)
    if (!nodeA || !nodeB) return
    editor.view.dispatch(
      state.tr
        .replaceWith(b.pos, b.pos + b.nodeSize, nodeA)
        .replaceWith(a.pos, a.pos + a.nodeSize, nodeB),
    )
    onClose()
  }

  if (confirming) {
    return <DeleteConfirm row={row} onCancel={onClose} onConfirm={remove} />
  }

  if (mode !== 'root') {
    const pick = mode === 'move' ? moveTo : swapWith
    // 場次一多就找不到人 —— 場次號、地點、登場人物都能篩
    const q = filter.trim().toLowerCase()
    const hits = q
      ? others.filter((r) =>
          [r.label, r.location, ...r.characters.map((c) => c.name)]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : others

    return (
      <div className={cls} ref={rootRef}>
        <header>
          <button className="back" onClick={() => { setMode('root'); setFilter('') }}>
            ←
          </button>
          {mode === 'move' ? '搬到哪一場的位置？' : '跟哪一場對調？'}
        </header>
        <input
          className="filter"
          autoFocus
          value={filter}
          placeholder="輸入場次號、地點或人物篩選"
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && hits.length) pick(hits[0])
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="scroll">
          {hits.map((r) => (
            <button key={r.pos} onClick={() => pick(r)}>
              <strong>S{r.label}</strong>
              <span>
                {r.location || '（未填地點）'}
                {r.characters.length > 0 && ` · ${r.characters.map((c) => c.name).join('、')}`}
              </span>
            </button>
          ))}
          {hits.length === 0 && <p className="empty">沒有符合的場次</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={cls} ref={rootRef}>
      <button onClick={() => setMode('move')} disabled={onlyScene}>
        <strong>搬移到⋯</strong>
        <span>抽出這一場插到別處，其餘場次遞補</span>
      </button>
      <button onClick={() => setMode('swap')} disabled={onlyScene}>
        <strong>與其他場次對調⋯</strong>
        <span>兩場互換位置，其餘不動</span>
      </button>
      <button className="danger" onClick={askRemove} disabled={onlyScene}>
        <strong>刪除這一場</strong>
        <span>{onlyScene ? '劇本至少要有一場' : '連同場內所有內容'}</span>
      </button>
    </div>
  )
}

function DeleteConfirm({
  row,
  onCancel,
  onConfirm,
}: {
  row: SceneRow
  onCancel: () => void
  onConfirm: () => void
}) {
  const [skip, setSkip] = useState(false)

  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>刪除 S{row.label}？</h3>
        <p>
          {row.location || '（未填地點）'} —— 場內所有內容會一起刪除。
          掛在這個場次上的下游引用（<code>{row.sceneId}</code>）會失效。
        </p>
        <label>
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          下次不再提醒
        </label>
        <div className="actions">
          <button onClick={onCancel}>取消</button>
          <button
            className="danger"
            onClick={() => {
              if (skip) localStorage.setItem(SKIP_CONFIRM_KEY, '1')
              onConfirm()
            }}
          >
            刪除
          </button>
        </div>
      </div>
    </div>
  )
}
