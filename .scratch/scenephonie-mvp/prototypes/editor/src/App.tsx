// 原型 —— 丟棄式程式碼。
//
// 用 ?variant=inline | panel | command 切換 metadata 的輸入方式。
// 右側永遠顯示「場次表」，那是同一份資料的投影，用來證明場次號是算出來的、
// sceneId 才是持久的。

import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Doc,
  Scene,
  Action,
  Dialogue,
  InsertShot,
  StableIds,
  SceneNumbers,
  DragGuard,
  BlockCycle,
  NextScene,
  SelectScope,
  type SceneVariant,
} from './scene-schema'
import {
  insertScene,
  setNextSceneIntercept,
  type NextSceneRequest,
} from './next-scene'
import { Slash, SlashMenu } from './slash'
import { CJKInput, CharacterTags, type CharacterRef } from './cjk-input'
import { projectScenes, findDuplicateIds, type SceneRow } from './numbering'
import './index.css'

const VARIANTS: { id: SceneVariant; name: string; blurb: string }[] = [
  { id: 'inline', name: 'A · 內嵌簡表', blurb: 'metadata 直接嵌在編輯器裡，像一列簡表' },
  { id: 'panel', name: 'B · 側邊面板', blurb: '編輯器只有唯讀摘要，游標所在場次在右側編輯' },
  { id: 'command', name: 'C · 漸進填寫', blurb: '不離開鍵盤，依序問內外→時間→地點→人物' },
]

const INITIAL = `
<section data-type="scene" data-scene-id="sc_aaa01"
         data-characters='[{"id":"ch_m1","name":"阿明"}]'>
  <p data-type="action">阿明推開玻璃門，店裡只剩一桌客人。</p>
  <p data-type="dialogue" data-character="阿明">還有位子嗎？</p>
  <p data-type="action">在這一行按 Tab 可以循環切換：動作 → 對白 → 插入鏡頭。打 / 會跳出選單。</p>
</section>
<section data-type="scene" data-scene-id="sc_bbb02"
         data-characters='[{"id":"ch_f1","name":"小美"}]'>
  <p data-type="action">小美低頭擦拭吧台，沒有抬頭。</p>
  <p data-type="insert-shot">吧台上那只缺角的馬克杯。</p>
</section>
`

function useVariant(): [SceneVariant, (v: SceneVariant) => void] {
  const read = (): SceneVariant => {
    const v = new URLSearchParams(location.search).get('variant')
    return VARIANTS.some((x) => x.id === v) ? (v as SceneVariant) : 'inline'
  }
  const [variant, setVariant] = useState<SceneVariant>(read)
  const set = (v: SceneVariant) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', v)
    history.replaceState(null, '', url)
    setVariant(v)
  }
  return [variant, set]
}

export default function App() {
  const [variant, setVariant] = useVariant()
  const [dedupe, setDedupe] = useState(false)

  return (
    <div className="app">
      {/* variant 與 dedupe 改變時整個編輯器重建 —— 原型不需要熱替換 extension */}
      <Workbench key={`${variant}:${dedupe}`} variant={variant} dedupe={dedupe} />
      <SlashMenu />
      <div className="bar">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            className={v.id === variant ? 'on' : ''}
            onClick={() => setVariant(v.id)}
            title={v.blurb}
          >
            {v.name}
          </button>
        ))}
        <label className="dedupe">
          <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
          自動修復重複 id
        </label>
      </div>
    </div>
  )
}

function Workbench({ variant, dedupe }: { variant: SceneVariant; dedupe: boolean }) {
  const [tick, setTick] = useState(0)

  const editor = useEditor({
    extensions: [
      // 刻意關掉粗體／斜線等 mark：架構約束 2 說資料模型不含呈現性資訊
      StarterKit.configure({
        // 文件是 `scene+`（見 scene-schema 的 Doc）；頂層段落沒有容身之處
        document: false,
        paragraph: false,
        heading: false,
        // hardBreak 佔用 Mod-Enter，會跟「新增下一場」搶；劇本也用不到軟換行
        hardBreak: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      Doc,
      Scene.configure({ variant }),
      Action,
      Dialogue,
      InsertShot,
      StableIds.configure({ dedupe }),
      SceneNumbers,
      DragGuard,
      BlockCycle,
      NextScene,
      SelectScope,
      Slash,
    ],
    content: INITIAL,
    onTransaction: () => setTick((t) => t + 1),
  })

  const rows = useMemo(() => (editor ? projectScenes(editor.state.doc) : []), [editor, tick])
  const dupes = findDuplicateIds(rows)

  // 游標所在的場次 —— 側邊面板編的就是它
  const current = useMemo(() => {
    if (!editor) return null
    const { $from } = editor.state.selection
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'scene') return $from.before(d)
    }
    return null
  }, [editor, tick])

  if (!editor) return null

  return (
    <>
      <div className="left">
        <h1>Scenephonie 編輯器原型</h1>
        <p className="hint">
          <strong>{VARIANTS.find((v) => v.id === variant)!.blurb}</strong>
          <br />
          <code>/next</code> 或 <kbd>⌘</kbd>+<kbd>Enter</kbd> 新增下一場，也可用場次腳部的按鈕。
          <kbd>Tab</kbd> 循環切換區塊型別。文件只由場次組成，場次之外不能打字。
          點場次號 <code>SX</code> 可搬移、對調、刪除；⠿ 可拖曳排序，區塊能跨場次拖。
        </p>
        {variant === 'command' && <Wizard editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      <div className="right">
        {variant === 'panel' && <MetaPanel editor={editor} pos={current} />}
        <SceneTable editor={editor} rows={rows} dupes={dupes} />
        <details>
          <summary>文件 JSON（持久化的長相）</summary>
          <pre>{JSON.stringify(editor.getJSON(), null, 1)}</pre>
        </details>
      </div>
    </>
  )
}

/** 場次表 —— 同一份資料的投影。零新增資訊。 */
function SceneTable({
  editor,
  rows,
  dupes,
}: {
  editor: Editor
  rows: SceneRow[]
  dupes: Set<string>
}) {
  return (
    <section className="panel">
      <h2>場次表（投影）</h2>
      {dupes.size > 0 && (
        <p className="warn">
          偵測到 {dupes.size} 個重複的 sceneId —— 錨點已破損。 複製貼上場次時，貼上的複本沿用了原本的
          id。勾選下方「自動修復重複 id」看修好的版本。
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>場次號</th>
            <th>內外</th>
            <th>時間</th>
            <th>地點</th>
            <th>登場人物</th>
            <th>sceneId</th>
            <th>重排</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pos} className={r.sceneId && dupes.has(r.sceneId) ? 'dupe' : ''}>
              <td>
                S{r.label}
              </td>
              <td>{r.intExt || '—'}</td>
              <td>{r.timeOfDay || '—'}</td>
              <td>{r.location || '—'}</td>
              <td>{r.characters.map((c) => c.name).join('、') || '—'}</td>
              <td>
                <code>{r.sceneId}</code>
              </td>
              <td className="nowrap">
                <button onClick={() => moveScene(editor, r, -1)}>↑</button>
                <button onClick={() => moveScene(editor, r, +1)}>↓</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        欄名刻意用「<strong>地點</strong>」而非業界慣用的「場景」—— 見 ADR-0001。
        <br />
        重排看看：<strong>場次號會變，sceneId 不會</strong>。這就是「場次是穩定錨點」。
      </p>
    </section>
  )
}

/** 變體 B 的側邊 metadata 面板 */
function MetaPanel({ editor, pos }: { editor: Editor; pos: number | null }) {
  if (pos === null) {
    return (
      <section className="panel">
        <h2>場次 metadata</h2>
        <p className="note">把游標放進任一場次。</p>
      </section>
    )
  }

  const node = editor.state.doc.nodeAt(pos)
  if (!node) return null
  const chars: CharacterRef[] = Array.isArray(node.attrs.characters) ? node.attrs.characters : []
  const set = (k: string, v: unknown) =>
    editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, k, v))

  return (
    <section className="panel">
      <h2>場次 metadata</h2>
      <div className="fields">
        <label>
          內外
          <select value={node.attrs.intExt} onChange={(e) => set('intExt', e.target.value)}>
            <option value="">—</option>
            <option value="內">內</option>
            <option value="外">外</option>
          </select>
        </label>
        <label>
          時間
          <select value={node.attrs.timeOfDay} onChange={(e) => set('timeOfDay', e.target.value)}>
            <option value="">—</option>
            {['日', '夜', '晨', '昏'].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          地點
          <CJKInput value={node.attrs.location} onCommit={(v) => set('location', v)} />
        </label>
        <label>
          登場人物
          <CharacterTags
            value={chars}
            onChange={(v) => set('characters', v)}
            onTabOut={() => {
              editor.commands.focus()
              editor.commands.setTextSelection(pos + 1)
            }}
          />
        </label>
        <label className="ro-field">
          sceneId
          <code>{node.attrs.sceneId}</code>
        </label>
      </div>
    </section>
  )
}

/** 變體 C：不離開鍵盤的漸進填寫 */
const STEPS = [
  { key: 'intExt', label: '內／外', options: ['內', '外'] },
  { key: 'timeOfDay', label: '時間', options: ['日', '夜', '晨', '昏'] },
  { key: 'location', label: '地點', options: null },
  { key: 'characters', label: '登場人物', options: null },
] as const

function Wizard({ editor }: { editor: Editor }) {
  const [req, setReq] = useState<NextSceneRequest | null>(null)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  // 攔截「新增下一場」—— 三個入口（/next、⌘+Enter、場次腳部按鈕）都會走到這裡。
  // 先問完 metadata 才真的插入場次，這正是變體 C 與 A／B 的差別。
  useEffect(() => {
    setNextSceneIntercept((r) => {
      setReq(r)
      setStep(0)
      setDraft({})
    })
    return () => setNextSceneIntercept(null)
  }, [])

  if (!req) {
    return (
      <p className="wizard-cue">
        按 <kbd>⌘</kbd>+<kbd>Enter</kbd> 開始漸進填寫新場次
      </p>
    )
  }

  const s = STEPS[step]

  const commit = (value: unknown) => {
    const next = { ...draft, [s.key]: value }
    if (step + 1 < STEPS.length) {
      setDraft(next)
      setStep(step + 1)
      return
    }
    insertScene(editor, { ...req, attrs: next })
    setReq(null)
    editor.commands.focus()
  }

  return (
    <div className="wizard">
      <span className="step">
        {step + 1}/{STEPS.length}
      </span>
      <strong>{s.label}</strong>
      {s.options ? (
        <span className="opts">
          {s.options.map((o, i) => (
            <button key={o} onClick={() => commit(o)}>
              <kbd>{i + 1}</kbd> {o}
            </button>
          ))}
        </span>
      ) : s.key === 'characters' ? (
        <WizardChars onDone={(v) => commit(v)} />
      ) : (
        <WizardText label={s.label} onDone={(v) => commit(v)} onCancel={() => setReq(null)} />
      )}
      <button className="cancel" onClick={() => setReq(null)}>
        取消
      </button>
    </div>
  )
}

function WizardText({
  label,
  onDone,
  onCancel,
}: {
  label: string
  onDone: (v: string) => void
  onCancel: () => void
}) {
  const [v, setV] = useState('')
  return (
    <CJKInput
      autoFocus
      value={v}
      placeholder={`輸入${label}後按 Enter`}
      onCommit={setV}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') onDone((e.target as HTMLInputElement).value)
        if (e.key === 'Escape') onCancel()
      }}
    />
  )
}

function WizardChars({ onDone }: { onDone: (v: CharacterRef[]) => void }) {
  const [v, setV] = useState<CharacterRef[]>([])
  return (
    <span className="wizard-chars">
      <CharacterTags value={v} onChange={setV} />
      <button onClick={() => onDone(v)}>完成</button>
    </span>
  )
}

function moveScene(editor: Editor, row: SceneRow, dir: -1 | 1) {
  const { state, view } = editor
  const rows = projectScenes(state.doc)
  const i = rows.findIndex((r) => r.pos === row.pos)
  const target = rows[i + dir]
  if (!target) return
  const node = state.doc.nodeAt(row.pos)
  if (!node) return

  const size = node.nodeSize
  let tr = state.tr.delete(row.pos, row.pos + size)
  // 刪除後，位於刪除點之後的位置會左移 size
  const insertAt = dir > 0 ? target.pos - size + target.nodeSize : target.pos
  tr = tr.insert(insertAt, node)
  view.dispatch(tr)
}
