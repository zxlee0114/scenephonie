// 原型 —— 丟棄式程式碼。不要拿去 production。
//
// 驗證的問題：Tiptap 的 node schema 能不能自然表達
// 「場次是容器，內含 metadata 與內容區塊」，且 sceneId 經過重排／複製貼上仍穩定。

import { Node, Extension, mergeAttributes, type Editor } from '@tiptap/core'
import { AllSelection, NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react'
import { projectScenes } from './numbering'
import { CJKInput, CharacterTags, type CharacterRef } from './cjk-input'
import { claimFocus, requestFocus } from './focus'
import { dragGuardDOMEvents, dragProps, useDropZone } from './dnd'
import { SceneMenu } from './scene-menu'
import { newSceneId, requestNextScene } from './next-scene'

export const newId = newSceneId

/**
 * 文件只由場次組成 —— 場次之外沒有可編輯的空間。
 *
 * 這是把架構約束 1 從「靠慣例維持」升級成「schema 保證」：任何文字都必然屬於
 * 某個場次，下游投影（場次表、PDF）不會遇到不知道該歸給誰的孤兒段落。
 * 代價是匯入既有劇本沒有落地區 —— 已排除在 v1 之外。
 */
export const Doc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'scene+',
})

const INT_EXT = ['內', '外']
const TIME_OF_DAY = ['日', '夜', '晨', '昏']

/** 把游標從某個表單欄位送進編輯器正文的指定位置。 */
function focusContent(editor: Editor, from: number) {
  const { state, view } = editor
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(from))).scrollIntoView())
  view.focus()
}

/**
 * 欄位裡的 Tab 不能冒泡到編輯器 —— 否則 BlockCycle 會同時觸發，
 * 把你正在編輯的區塊轉成別的型別，輸入框當場消失、焦點飛走。
 */
const swallowTab = (e: ReactKeyboardEvent) => {
  if (e.key === 'Tab') e.stopPropagation()
}

// ---------------------------------------------------------------- 內容區塊
//
// 三種區塊都要 priority > 1000：StarterKit 的 Paragraph 是 1000，它的 `tag: 'p'`
// 會先命中，把 data-type 的規則整個蓋掉 —— 內容會被解析成普通段落、掉到場次外面。

/** 三種區塊共用的外殼：拖曳把手 + 落點偵測。區塊可以跨場次拖。 */
function BlockShell({
  node,
  editor,
  getPos,
  className,
  children,
}: NodeViewProps & { className: string; children: ReactNode }) {
  const pos = typeof getPos === 'function' ? (getPos() ?? null) : null
  const { over, dropProps } = useDropZone(editor, 'block', pos, node.nodeSize)

  return (
    <NodeViewWrapper className={`${className}${over ? ` drop-${over}` : ''}`} {...dropProps}>
      <span className="drag-handle" contentEditable={false} {...dragProps('block', pos, node.nodeSize)}>
        ⠿
      </span>
      {children}
    </NodeViewWrapper>
  )
}

export const Action = Node.create({
  name: 'action',
  priority: 1100,
  group: 'sceneBlock',
  content: 'inline*',
  parseHTML: () => [{ tag: 'p[data-type="action"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-type': 'action' }),
    0,
  ],
  addNodeView() {
    return ReactNodeViewRenderer(ActionView)
  },
})

function ActionView(props: NodeViewProps) {
  return (
    <BlockShell {...props} className="block action">
      <NodeViewContent className="action-text" />
    </BlockShell>
  )
}

export const Dialogue = Node.create({
  name: 'dialogue',
  priority: 1100,
  group: 'sceneBlock',
  content: 'inline*',
  addAttributes() {
    return {
      character: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-character'),
        renderHTML: (attrs) => ({ 'data-character': attrs.character }),
      },
    }
  },
  parseHTML: () => [{ tag: 'p[data-type="dialogue"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-type': 'dialogue' }),
    0,
  ],
  addNodeView() {
    return ReactNodeViewRenderer(DialogueView)
  },
})

function DialogueView(props: NodeViewProps) {
  const { node, editor, updateAttributes, getPos } = props
  const ref = useRef<HTMLInputElement>(null)
  const pos = typeof getPos === 'function' ? (getPos() ?? null) : null

  // Tab 轉成對白之後，游標該直接落在人物欄裡
  useEffect(() => {
    if (pos === null) return
    if (claimFocus((p) => p.kind === 'character' && p.pos === pos)) {
      ref.current?.focus()
    }
  })

  return (
    <BlockShell {...props} className="block dialogue">
      <CJKInput
        ref={ref}
        className="char-input"
        value={node.attrs.character}
        placeholder="人物"
        onCommit={(v) => updateAttributes({ character: v })}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Tab' && !e.shiftKey && pos !== null) {
            // 打完人物名，Tab 直接進台詞 —— 不要讓 BlockCycle 攔截
            e.preventDefault()
            e.stopPropagation()
            focusContent(editor, pos + 1)
          }
        }}
      />
      <NodeViewContent className="dialogue-text" />
    </BlockShell>
  )
}

export const InsertShot = Node.create({
  name: 'insertShot',
  priority: 1100,
  group: 'sceneBlock',
  content: 'inline*',
  parseHTML: () => [{ tag: 'p[data-type="insert-shot"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-type': 'insert-shot' }),
    0,
  ],
  addNodeView() {
    return ReactNodeViewRenderer(InsertShotView)
  },
})

function InsertShotView(props: NodeViewProps) {
  return (
    <BlockShell {...props} className="block insert-shot">
      <span className="shot-tag">插入鏡頭</span>
      <NodeViewContent className="shot-text" />
    </BlockShell>
  )
}

// ---------------------------------------------------------------- 場次

export type SceneVariant = 'inline' | 'panel' | 'command'

export const Scene = Node.create<{ variant: SceneVariant }>({
  name: 'scene',
  group: 'block',
  content: 'sceneBlock+',
  defining: true,
  isolating: true,

  addOptions() {
    return { variant: 'inline' }
  },

  addAttributes() {
    // 注意：場次號不在這裡，它是推導出來的（見 numbering.ts）。
    // 摘要也不在這裡 —— 編劇通常不逐場填寫，見 CONTEXT.md「劇情概要」。
    return {
      sceneId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-scene-id'),
        renderHTML: (attrs) => ({ 'data-scene-id': attrs.sceneId }),
      },
      intExt: { default: '' },
      timeOfDay: { default: '' },
      location: { default: '' },
      // 人物是實體不是字串。這裡的形狀是原型用的暫定版 ——
      // 真正的設計還卡在「劇本儲存模型」那張票。
      characters: {
        default: [],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-characters') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attrs) => ({ 'data-characters': JSON.stringify(attrs.characters ?? []) }),
      },
    }
  },

  parseHTML: () => [{ tag: 'section[data-type="scene"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'section',
    mergeAttributes(HTMLAttributes, { 'data-type': 'scene' }),
    0,
  ],

  addNodeView() {
    const variant = this.options.variant
    return ReactNodeViewRenderer(
      (props: NodeViewProps) => <SceneView {...props} variant={variant} />,
      {
        // Tiptap 預設「節點沒變就不重繪」，decoration 變了它會直接跳過 ——
        // 場次號與全選狀態都活在 decoration 裡，所以得自己指定重繪條件。
        // 比的是自己那一份的值，不是整個 decoration 陣列：後者每次都是新物件，
        // 比了等於每按一個鍵所有場次全部重繪，就白費工夫了。
        update: ({ oldNode, newNode, oldDecorations, newDecorations, updateProps }) => {
          if (oldNode.type !== newNode.type) return false
          if (oldNode !== newNode || sigOf(oldDecorations) !== sigOf(newDecorations)) {
            updateProps()
          }
          return true
        },
      },
    )
  },
})

const specOf = (decorations: readonly Decoration[]) =>
  decorations.find((d) => d.spec?.sceneNo)?.spec

const sceneNoOf = (decorations: readonly Decoration[]): string | undefined =>
  specOf(decorations)?.sceneNo

const isSelected = (decorations: readonly Decoration[]): boolean =>
  !!specOf(decorations)?.selected

/** 重繪的判斷依據：號碼變了、或全選狀態變了 */
const sigOf = (decorations: readonly Decoration[]): string => {
  const spec = specOf(decorations)
  return `${spec?.sceneNo ?? ''}:${spec?.selected ? 1 : 0}`
}

function SceneView({
  node,
  editor,
  getPos,
  updateAttributes,
  decorations,
  variant,
}: NodeViewProps & { variant: SceneVariant }) {
  const firstField = useRef<HTMLSelectElement>(null)

  // /scene 建完場次，游標直接進第一個 metadata 欄位
  useEffect(() => {
    if (claimFocus((p) => p.kind === 'sceneMeta' && p.sceneId === node.attrs.sceneId)) {
      firstField.current?.focus()
    }
  })

  const pos = typeof getPos === 'function' ? (getPos() ?? null) : null
  // 場次號從 decoration 讀，不自己算 —— 見底下 SceneNumbers 的說明
  const label = sceneNoOf(decorations) ?? '?'
  const [menuOpen, setMenuOpen] = useState(false)
  const { over, dropProps } = useDropZone(editor, 'scene', pos, node.nodeSize)
  const wrapClass = `scene${over ? ` drop-${over}` : ''}${
    isSelected(decorations) ? ' scene-selected' : ''
  }`
  const chars: CharacterRef[] = Array.isArray(node.attrs.characters) ? node.attrs.characters : []

  // 場次層級的動作（搬移、對調、刪除）全部收在點場次號這一個入口
  const rows = menuOpen ? projectScenes(editor.state.doc) : []
  const row = rows.find((r) => r.pos === pos)

  const head = (
    <>
      <span className="drag-handle" {...dragProps('scene', pos, node.nodeSize)}>
        ⠿
      </span>
      <button
        className={`scene-no${menuOpen ? ' on' : ''}`}
        onClick={() => setMenuOpen((o) => !o)}
        title="搬移、對調、刪除"
      >
        S{label}
        <span className="caret">▾</span>
      </button>
      {menuOpen && row && (
        <SceneMenu
          editor={editor}
          row={row}
          rows={rows}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  )

  // 快捷鍵之外的直觀入口。場次之外沒有可點的空間了，所以按鈕得住在場次腳部。
  // 位置要明講：按鈕是用滑鼠點的，游標可能還在別的場次裡。
  const after = pos === null ? undefined : pos + node.nodeSize
  const foot = (
    <div className="scene-foot" contentEditable={false}>
      <button onMouseDown={(e) => { e.preventDefault(); requestNextScene(editor, after) }}>
        ＋ 新增下一場
      </button>
    </div>
  )

  if (variant === 'inline') {
    // 變體 A：metadata 內嵌在編輯器裡，做成類似簡表的一列
    return (
      <NodeViewWrapper className={wrapClass} {...dropProps}>
        <div className="scene-head inline-head" contentEditable={false} onKeyDown={swallowTab}>
          {head}
          <select
            ref={firstField}
            value={node.attrs.intExt}
            onChange={(e) => updateAttributes({ intExt: e.target.value })}
          >
            <option value="">內／外</option>
            {INT_EXT.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={node.attrs.timeOfDay}
            onChange={(e) => updateAttributes({ timeOfDay: e.target.value })}
          >
            <option value="">時間</option>
            {TIME_OF_DAY.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <CJKInput
            placeholder="地點"
            value={node.attrs.location}
            onCommit={(v) => updateAttributes({ location: v })}
          />
          <CharacterTags
            value={chars}
            onChange={(v) => updateAttributes({ characters: v })}
            onTabOut={() => pos !== null && focusContent(editor, pos + 1)}
          />
          <code className="sid">{node.attrs.sceneId}</code>
        </div>
        <NodeViewContent className="scene-body" />
        {foot}
      </NodeViewWrapper>
    )
  }

  // 變體 B／C：編輯器裡只有唯讀摘要列，metadata 在側邊面板編輯
  return (
    <NodeViewWrapper className={wrapClass} {...dropProps}>
      <div className="scene-head read-head" contentEditable={false}>
        {head}
        <span className="ro">
          {node.attrs.intExt || '—'} / {node.attrs.timeOfDay || '—'} /{' '}
          {node.attrs.location || '（未填地點）'}
          {chars.length > 0 && ` / ${chars.map((c) => c.name).join('、')}`}
        </span>
        <code className="sid">{node.attrs.sceneId}</code>
      </div>
      <NodeViewContent className="scene-body" />
      {foot}
    </NodeViewWrapper>
  )
}

// ---------------------------------------------------------------- 場次號與全選
//
// 場次號不進文件、不進資料庫 —— 它只在要給人看的那一刻才存在。
//
// 系統裡沒有任何東西用場次號當 key（約束 1：下游一律掛 sceneId），所以它是
// 純粹的渲染值。場次表與 PDF 匯出各自呼叫 projectScenes()；編輯器也一樣，
// 只是得透過 decoration 才能讓 ProseMirror 知道哪些 node view 該重繪 ——
// node view 預設只在「自己的節點變了」時重繪，插入場次不會動到後面的場次，
// 它們的編號就會停在舊值。

export const sceneNumbersKey = new PluginKey('sceneNumbers')

/** 拖曳期間把 ProseMirror 的原生拖放讓開 —— 說明見 dnd.ts */
export const DragGuard = Extension.create({
  name: 'dragGuard',
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleDOMEvents: dragGuardDOMEvents } })]
  },
})

export const SceneNumbers = Extension.create({
  name: 'sceneNumbers',
  addProseMirrorPlugins() {
    // decorations 在每次 state 變動時都會被呼叫，包含只移動游標。
    // 文件與全選狀態都沒變，就沒必要重算。
    let cached: { doc: unknown; from: number; to: number; set: DecorationSet } | null = null

    return [
      new Plugin({
        key: sceneNumbersKey,
        props: {
          decorations: (state) => {
            // 被選取範圍完整涵蓋的場次，整塊反白。
            //
            // 不靠瀏覽器畫原生選取範圍：場次的 DOM 是混合結構（標頭的表單欄位、
            // 拖曳把手、腳部按鈕都是 contentEditable={false}），原生高亮跨過這些
            // 區域時畫不出來 —— 症狀是游標消失、但什麼都沒反白。
            // 區塊層級的選取仍然交給瀏覽器，那是單純的文字範圍，畫得出來。
            const { from, to } = state.selection
            if (cached?.doc === state.doc && cached.from === from && cached.to === to) {
              return cached.set
            }

            const set = DecorationSet.create(
              state.doc,
              projectScenes(state.doc).map((row) => {
                const covered = from <= row.pos && to >= row.pos + row.nodeSize
                // class 不由 decoration 寫：NodeViewWrapper 的 className 是 React 控制的，
                // 每次重繪都會把 ProseMirror 加上去的 class 洗掉。值放 spec，交給 React 組。
                return Decoration.node(
                  row.pos,
                  row.pos + row.nodeSize,
                  { 'data-scene-no': row.label },
                  { sceneNo: row.label, selected: covered },
                )
              }),
            )
            cached = { doc: state.doc, from, to, set }
            return set
          },
        },
      }),
    ]
  },
})

// ---------------------------------------------------------------- 穩定 id

export const stableIdsKey = new PluginKey('stableIds')

export const StableIds = Extension.create<{ dedupe: boolean }>({
  name: 'stableIds',
  addOptions() {
    return { dedupe: false }
  },
  addProseMirrorPlugins() {
    const dedupe = this.options.dedupe
    return [
      new Plugin({
        key: stableIdsKey,
        appendTransaction: (_trs, _old, newState) => {
          const tr = newState.tr
          let changed = false
          const seen = new Set<string>()

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'scene') return true
            const id = node.attrs.sceneId
            if (!id) {
              tr.setNodeAttribute(pos, 'sceneId', newId())
              changed = true
            } else if (dedupe && seen.has(id)) {
              // 貼上的複本搶了同一個 id —— 換掉後來者
              tr.setNodeAttribute(pos, 'sceneId', newId())
              changed = true
            } else {
              seen.add(id)
            }
            return false
          })

          return changed ? tr : null
        },
      }),
    ]
  },
})

// ---------------------------------------------------------------- Tab 循環
// 動作與對白在寫作時交替太頻繁，每次打斜線指令會毀掉心流。
// 建立場次走斜線選單，切換區塊型別走 Tab。

const CYCLE = ['action', 'dialogue', 'insertShot']

export const BlockCycle = Extension.create({
  name: 'blockCycle',
  addKeyboardShortcuts() {
    const cycle = (dir: 1 | -1) => () => {
      const { state, view } = this.editor
      const { $from } = state.selection
      const idx = CYCLE.indexOf($from.parent.type.name)
      if (idx === -1) return false

      const next = CYCLE[(idx + dir + CYCLE.length) % CYCLE.length]
      const pos = $from.before()
      view.dispatch(
        state.tr.setNodeMarkup(
          pos,
          state.schema.nodes[next],
          next === 'dialogue' ? { character: '' } : {},
        ),
      )
      // 轉成對白時，游標直接進人物欄
      if (next === 'dialogue') requestFocus({ kind: 'character', pos })
      return true
    }

    // 反向循環：從對白退回動作只要一步，不必繞完整圈
    return { Tab: cycle(1), 'Shift-Tab': cycle(-1) }
  },
})

// ---------------------------------------------------------------- 漸進式全選
//
// ⌘+A 直接跳到整份文件，中間層級就沒得選了 —— 而寫作時最常要的是「選起
// 我正在寫的這一段」。全選就照文件結構一層一層擴：
//
//   區塊 → 這一場的內文 → 整場（含 metadata）→ 整份劇本
//
// 內文與整場要分成兩步：「重寫這一場但保留 metadata」是真實的寫作動作，
// 而場次節點本身連同 metadata 落在內文範圍之外，不另外一步就選不到。

export const SelectScope = Extension.create({
  name: 'selectScope',
  // 要蓋過 Tiptap 內建 Keymap 的 Mod-a（它直接給 AllSelection）
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      'Mod-a': () => {
        const { state, view } = this.editor
        const { selection, doc } = state
        const { $from, from, to } = selection

        // 已經選起整個場次節點了 —— 下一步只剩整份
        const onScene =
          selection instanceof NodeSelection && selection.node.type.name === 'scene'
        if (onScene) {
          view.dispatch(state.tr.setSelection(new AllSelection(doc)))
          return true
        }

        let sceneDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'scene') {
            sceneDepth = d
            break
          }
        }
        const scenePos = sceneDepth >= 0 ? $from.before(sceneDepth) : null

        // 比對要拿「同一個函式算出來的結果」，不能拿算之前的原始位置：
        // TextSelection.between() 會把端點移到最近的合法文字位置，所以內文選取的
        // from 其實在第一個區塊內部，跟 $from.start(sceneDepth) 對不上 ——
        // 條件永遠不成立，⌘+A 就會在前兩層之間打轉。
        const blockSel = TextSelection.create(doc, $from.start(), $from.end())
        const contentSel =
          sceneDepth >= 0
            ? TextSelection.between(
                doc.resolve($from.start(sceneDepth)),
                doc.resolve($from.end(sceneDepth)),
              )
            : null

        const atBlock = from === blockSel.from && to === blockSel.to
        const atContent = !!contentSel && from === contentSel.from && to === contentSel.to

        let next
        if (atContent && scenePos !== null) {
          next = NodeSelection.create(doc, scenePos) // 整場，含 metadata
        } else if (atBlock && contentSel) {
          next = contentSel // 這一場的內文
        } else {
          next = blockSel // 這一個區塊
        }

        view.dispatch(state.tr.setSelection(next))
        return true
      },
    }
  },
})

// ---------------------------------------------------------------- 新增下一場

export const NextScene = Extension.create({
  name: 'nextScene',
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => requestNextScene(this.editor) }
  },
})
