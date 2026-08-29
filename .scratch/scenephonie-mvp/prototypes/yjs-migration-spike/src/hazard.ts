// 一支針對性的探針。
//
// 主測試通過之後，Y.Doc 的內部表示露出一件事：`kind: null` **完全沒有出現**
// 在 Y.XmlElement 的 attributes 裡。往返之所以等價，是因為 `kind` 的 schema
// 預設值剛好也是 `null`，回程時 ProseMirror 用預設值把它補了回來。
//
// 也就是說「null attr 遷得過去」是**巧合**，不是保證。真正的規則是：
//
//     y-prosemirror 不儲存 null attr；回程一律由 schema 預設值填補。
//     → 只有「預設值 === null」的欄位才安全。
//
// 這支探針用一個預設值不是 null 的欄位證明它，免得日後有人加了
// `default: '一般'` 的欄位、又讓它裝 null，然後在遷移時被靜默改值。

import * as Y from 'yjs'
import { Schema, Node } from 'prosemirror-model'
import { prosemirrorToYDoc, yDocToProsemirror } from 'y-prosemirror'

const probeSchema = new Schema({
  nodes: {
    doc: { content: 'para+' },
    para: {
      content: 'text*',
      attrs: {
        // 預設值是 null —— 安全的形狀
        safeNull: { default: null },
        // 預設值不是 null，但這一份文件裡裝的是 null —— 危險的形狀
        hazardous: { default: '一般' },
      },
      toDOM: () => ['p', 0],
    },
    text: {},
  },
})

export function runHazardProbe(): { safeOK: boolean; hazardOK: boolean; recovered: unknown } {
  const doc = Node.fromJSON(probeSchema, {
    type: 'doc',
    content: [
      {
        type: 'para',
        attrs: { safeNull: null, hazardous: null },
        content: [{ type: 'text', text: '探針' }],
      },
    ],
  })

  const ydoc = prosemirrorToYDoc(doc, 'prosemirror')
  const back = yDocToProsemirror(probeSchema, ydoc) as Node
  const attrs = back.child(0).attrs

  return {
    safeOK: attrs.safeNull === null,
    hazardOK: attrs.hazardous === null,
    recovered: attrs.hazardous,
  }
}
