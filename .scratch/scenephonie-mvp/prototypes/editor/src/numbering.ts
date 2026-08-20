// 場次號的推導演算法 —— 這個檔案是原型的核心論點。
//
// 場次號「不存在資料裡」。它是從場次在序列中的位置即時算出來的。
// 場次身上唯一持久的是 sceneId。
//
// 編號永遠是 1..N，沒有 S5A 這種字母尾綴。
//
// 字母尾綴是業界用來繞過「重新編號會讓已發出去的下游表單失效」的 workaround，
// 而那個洞正是架構約束 1（場次是穩定錨點）要填的。把 workaround 跟解法一起做，
// 等於承認解法沒用 —— 原型也證實了它是假保護：S5A 一被搬走就變成 S2A。
//
// 「已交付版本」是個真實概念（寄出的 PDF、發出去的唯讀連結），字母尾綴應該是
// 它的衍生結果，不是使用者手動打的旗標。那屬於票券 07 的範圍。

import type { Node as PMNode } from '@tiptap/pm/model'
import type { CharacterRef } from './cjk-input'

export type SceneRow = {
  sceneId: string | null
  label: string // 場次號（推導出來的顯示標籤）
  intExt: string
  timeOfDay: string
  location: string
  characters: CharacterRef[]
  pos: number // 在文件中的位置，僅用於原型的重排操作
  nodeSize: number
}

export function projectScenes(doc: PMNode): SceneRow[] {
  const rows: SceneRow[] = []
  let count = 0

  doc.descendants((node, pos) => {
    if (node.type.name !== 'scene') return true
    count += 1

    rows.push({
      sceneId: node.attrs.sceneId,
      label: String(count),
      intExt: node.attrs.intExt || '',
      timeOfDay: node.attrs.timeOfDay || '',
      location: node.attrs.location || '',
      characters: Array.isArray(node.attrs.characters) ? node.attrs.characters : [],
      pos,
      nodeSize: node.nodeSize,
    })

    return false // 不往場次內部遞迴
  })

  return rows
}

/** 找出重複的 sceneId —— 用來偵測複製貼上造成的錨點破損 */
export function findDuplicateIds(rows: SceneRow[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const r of rows) {
    if (!r.sceneId) continue
    if (seen.has(r.sceneId)) dupes.add(r.sceneId)
    seen.add(r.sceneId)
  }
  return dupes
}
