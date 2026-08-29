// 等價比對器。作者指定：**以 document semantics 為準，不要求 JSON byte-level equality**。
//
// 六項驗收：node type / tree（結構與巢狀）/ attrs / sceneId / text / marks。
//
// 「document semantics」在這裡的具體意思是**只做一項正規化**：把 inline 內容
// 攤成 (文字, marks) 的連續段落，相鄰且 marks 相同者合併。理由是 text node
// 的切法是儲存細節不是文件意義 —— `["ab"]` 與 `["a","b"]` 是同一份文件。
// 除此之外一律嚴格比對，attrs 尤其**不做任何寬容**（掉一項就是資料毀損）。

import { Node } from 'prosemirror-model'

export type Diff = { path: string; item: string; left: unknown; right: unknown }

type Run = { text: string; marks: string }

/** 把 marks 正規化成穩定字串（依 mark 型別排序，attrs 依 key 排序）。 */
function marksKey(node: Node): string {
  return node.marks
    .map((m) => `${m.type.name}(${stableJSON(m.attrs)})`)
    .sort()
    .join('+')
}

function stableJSON(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )
}

/** 攤平 inline 子節點成 runs，相鄰且 marks 相同者合併。 */
function inlineRuns(node: Node): Run[] {
  const runs: Run[] = []
  node.forEach((child) => {
    if (!child.isText) return
    const marks = marksKey(child)
    const last = runs[runs.length - 1]
    if (last && last.marks === marks) last.text += child.text ?? ''
    else runs.push({ text: child.text ?? '', marks })
  })
  return runs
}

/** 非 inline 的子節點（樹的骨架）。 */
function blockChildren(node: Node): Node[] {
  const out: Node[] = []
  node.forEach((child) => {
    if (!child.isText) out.push(child)
  })
  return out
}

function label(node: Node, index: number): string {
  const id = node.attrs?.sceneId ?? node.attrs?.groupId
  return `${node.type.name}[${index}]${id ? `#${id}` : ''}`
}

/**
 * 平行走兩棵樹，逐項比對六樣東西。回傳所有差異（不是遇到第一個就停），
 * 這樣一次就能看清楚是「掉一個 attr」還是「整棵樹形狀不對」。
 */
export function compareDocs(left: Node, right: Node): Diff[] {
  const diffs: Diff[] = []
  walk(left, right, 'doc', diffs)
  return diffs
}

function walk(a: Node, b: Node, path: string, diffs: Diff[]): void {
  // ① node type
  if (a.type.name !== b.type.name) {
    diffs.push({ path, item: 'node type', left: a.type.name, right: b.type.name })
    return // 型別都不同了，再往下比沒有意義
  }

  // ③ attrs（含 ④ sceneId —— 它是 attrs 的一員，但單獨再報一次，
  //    因為掉了它是資料毀損等級，不能淹沒在一堆 attr 差異裡）
  const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])
  for (const key of keys) {
    const av = a.attrs[key]
    const bv = b.attrs[key]
    if (stableJSON(av) !== stableJSON(bv)) {
      diffs.push({ path, item: `attrs.${key}`, left: av, right: bv })
      if (key === 'sceneId') {
        diffs.push({ path, item: '⚠️ sceneId（永久錨點）', left: av, right: bv })
      }
    }
  }

  // ⑤ text + ⑥ marks
  const ar = inlineRuns(a)
  const br = inlineRuns(b)
  if (stableJSON(ar) !== stableJSON(br)) {
    const sameText = ar.map((r) => r.text).join('') === br.map((r) => r.text).join('')
    diffs.push({
      path,
      item: sameText ? 'marks' : 'text',
      left: ar,
      right: br,
    })
  }

  // ② tree
  const ac = blockChildren(a)
  const bc = blockChildren(b)
  if (ac.length !== bc.length) {
    diffs.push({
      path,
      item: 'tree（子節點數）',
      left: ac.map((n) => n.type.name),
      right: bc.map((n) => n.type.name),
    })
  }
  const n = Math.min(ac.length, bc.length)
  for (let i = 0; i < n; i++) {
    walk(ac[i], bc[i], `${path} > ${label(ac[i], i)}`, diffs)
  }
}

/** 逐項驗收表 —— 六項各自過或不過。 */
export function verdictTable(diffs: Diff[]): Array<{ item: string; ok: boolean; count: number }> {
  const buckets: Array<[string, (d: Diff) => boolean]> = [
    ['node type', (d) => d.item === 'node type'],
    ['tree', (d) => d.item.startsWith('tree')],
    ['attrs', (d) => d.item.startsWith('attrs.')],
    ['sceneId', (d) => d.item.startsWith('⚠️ sceneId')],
    ['text', (d) => d.item === 'text'],
    ['marks', (d) => d.item === 'marks'],
  ]
  return buckets.map(([item, match]) => {
    const count = diffs.filter(match).length
    return { item, ok: count === 0, count }
  })
}
