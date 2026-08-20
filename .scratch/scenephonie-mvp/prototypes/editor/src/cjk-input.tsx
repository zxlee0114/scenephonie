// 中文輸入安全的欄位元件。
//
// 前一版的 bug：`<input value={外部狀態} onChange={立刻寫回外部}>`。
// 注音組字期間瀏覽器仍會觸發 input 事件，於是「ㄅ」被寫進文件、
// 再從文件流回 value，把 input 的值重設 —— 這會**清掉 IME 的組字緩衝**，
// 結果就是注音符號一個個掉出來而不是組成字。
//
// 修法是標準做法：組字期間只更新本地狀態，compositionend 才回寫。
// 這與 ProseMirror 無關 —— 任何「受控輸入 + 立即回寫外部儲存」都會中招。

import { useEffect, useRef, useState, type ComponentPropsWithRef } from 'react'

type Props = Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange'> & {
  value: string
  onCommit: (v: string) => void
}

export function CJKInput({ value, onCommit, ...rest }: Props) {
  const [local, setLocal] = useState(value)
  const composing = useRef(false)

  // 外部值變動時同步 —— 但組字進行中絕不覆寫
  useEffect(() => {
    if (!composing.current) setLocal(value)
  }, [value])

  return (
    <input
      {...rest}
      value={local}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        const v = e.currentTarget.value
        setLocal(v)
        onCommit(v)
      }}
      onChange={(e) => {
        const v = e.target.value
        setLocal(v)
        if (!composing.current) onCommit(v) // 組字中不回寫
      }}
      onBlur={(e) => {
        if (e.currentTarget.value !== value) onCommit(e.currentTarget.value)
        rest.onBlur?.(e)
      }}
    />
  )
}

// ---------------------------------------------------------------- 登場人物

// 原型用的形狀。真正的人物實體設計還卡在「劇本儲存模型」那張票 ——
// characterId 這裡是就地生成的，不是真的指向人物實體。
export type CharacterRef = { id: string; name: string }

const newCharId = () => 'ch_' + Math.random().toString(36).slice(2, 7)

export function CharacterTags({
  value,
  onChange,
  onTabOut,
}: {
  value: CharacterRef[]
  onChange: (v: CharacterRef[]) => void
  /** 這是 metadata 的最後一欄 —— Tab 該離開欄位、跳進正文 */
  onTabOut?: () => void
}) {
  const [draft, setDraft] = useState('')
  const composing = useRef(false)

  const add = (raw: string) => {
    const name = raw.trim()
    setDraft('')
    if (!name) return value
    if (value.some((c) => c.name === name)) return value
    const next = [...value, { id: newCharId(), name }]
    onChange(next)
    return next
  }

  return (
    <span className="tags">
      {value.map((c) => (
        <span key={c.id} className="tag" title={c.id}>
          {c.name}
          {/* tabIndex -1：刪除鈕不該卡在 Tab 動線上 */}
          <button tabIndex={-1} onClick={() => onChange(value.filter((x) => x.id !== c.id))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        placeholder={value.length ? '' : '登場人物'}
        value={draft}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (composing.current) return // 組字中的 Enter 是「選字」，不是「送出」
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
            return
          }
          if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
            return
          }
          if (e.key === 'Tab' && !e.shiftKey && onTabOut) {
            // 先把打到一半的名字收下，再跳進正文
            add(draft)
            e.preventDefault()
            e.stopPropagation()
            onTabOut()
          }
        }}
        onBlur={() => add(draft)}
      />
    </span>
  )
}
