// 票券 19：ProseMirror doc → Y.Doc 遷移可行性 spike。
//
// 驗的是票券 04 Q4 那條**承重且未實測**的假設：日後從 ProseMirror JSON
// 遷移到 Yjs 很便宜（一次性離線腳本、純結構轉換）。假設不成立則 Q4 翻盤。
//
// 跑法：pnpm install && pnpm spike

import * as Y from 'yjs'
import { prosemirrorToYDoc, yDocToProsemirror } from 'y-prosemirror'
import { Node } from 'prosemirror-model'
import { schema } from './schema.ts'
import { fixtureDoc, fixtureJSON } from './fixture.ts'
import { compareDocs, verdictTable, type Diff } from './equivalence.ts'
import { runHazardProbe } from './hazard.ts'

const XML_FRAGMENT = 'prosemirror' // y-prosemirror 的預設 fragment 名

function report(title: string, diffs: Diff[]): boolean {
  const table = verdictTable(diffs)
  console.log(`\n── ${title}`)
  for (const row of table) {
    console.log(`   ${row.ok ? '✅' : '❌'} ${row.item}${row.ok ? '' : `（${row.count} 處差異）`}`)
  }
  if (diffs.length > 0) {
    console.log('\n   差異明細：')
    for (const d of diffs.slice(0, 40)) {
      console.log(`   · ${d.path}`)
      console.log(`     ${d.item}`)
      console.log(`       原：${JSON.stringify(d.left)}`)
      console.log(`       後：${JSON.stringify(d.right)}`)
    }
    if (diffs.length > 40) console.log(`   …另有 ${diffs.length - 40} 處`)
  }
  return diffs.length === 0
}

/** 逐節點清點 fixture 的涵蓋度，證明驗收素材真的到齊。 */
function coverage(doc: Node): void {
  const counts = new Map<string, number>()
  const kinds = new Set<string>()
  doc.descendants((node) => {
    counts.set(node.type.name, (counts.get(node.type.name) ?? 0) + 1)
    if (node.type.name === 'scene' && node.attrs.kind) kinds.add(node.attrs.kind)
    if (node.attrs?.intExt === '雜景') kinds.add('雜景')
    if (node.attrs?.manualDraft === true) kinds.add('草稿')
    if (Array.isArray(node.attrs?.location)) kinds.add('多值地點')
    return true
  })
  console.log('── 驗收素材涵蓋度')
  console.log(
    '   節點：',
    [...counts.entries()].map(([k, v]) => `${k}×${v}`).join('　'),
  )
  console.log('   特例：', [...kinds].join('　'))
}

function main(): void {
  console.log('票券 19 · ProseMirror doc ⇄ Y.Doc 遷移 spike')
  console.log('='.repeat(60))

  coverage(fixtureDoc)

  // ── 1. 正向：PM doc → Y.Doc
  const ydoc = prosemirrorToYDoc(fixtureDoc, XML_FRAGMENT)

  // ── 2. 走一趟真正的持久化：encode 成 bytes、丟進一份全新的 Y.Doc。
  //    這一步是刻意的 —— 遷移腳本寫進資料庫的是 bytea，不是記憶體裡的物件。
  //    少了它，測到的只是同一個物件轉來轉去。
  const update = Y.encodeStateAsUpdate(ydoc)
  const reloaded = new Y.Doc()
  Y.applyUpdate(reloaded, update)

  // ── 3. 反向：Y.Doc → PM doc
  const roundTripped = yDocToProsemirror(schema, reloaded) as Node

  // ── 4. 六項比對
  const ok = report('等價比對（原 doc vs 往返後）', compareDocs(fixtureDoc, roundTripped))

  // ── 5. 順便量一下體積，給 Q3（jsonb）與日後 bytea 的取捨留個數字
  const jsonBytes = Buffer.byteLength(JSON.stringify(fixtureJSON), 'utf8')
  const yBytes = update.byteLength
  console.log('\n── 體積（同一份 fixture）')
  console.log(`   ProseMirror JSON：${jsonBytes} bytes`)
  console.log(`   Y.Doc update    ：${yBytes} bytes（${(yBytes / jsonBytes).toFixed(2)}×）`)

  // ── 6. 額外一項：attrs 在 Y.Doc **自己的表示法裡**長什麼樣。
  //    這一項不在票券要求內，但它決定「遷移後還能不能用眼睛看」——
  //    Q3 選 jsonb 買的正是這個能力，換 Yjs 時會退掉多少值得先知道。
  const frag = reloaded.getXmlFragment(XML_FRAGMENT)
  const firstScene = frag.get(0) as Y.XmlElement
  console.log('\n── Y.Doc 內部表示（第一個場次的 attrs）')
  console.log('   nodeName：', firstScene.nodeName)
  for (const [k, v] of Object.entries(firstScene.getAttributes())) {
    console.log(`   ${k}: ${JSON.stringify(v)}　(${Array.isArray(v) ? 'array' : typeof v})`)
  }

  // ── 7. 探針：null attr 的真實規則（見 hazard.ts）
  const probe = runHazardProbe()
  console.log('\n── 探針：null attr 遷不遷得過去')
  console.log(`   ${probe.safeOK ? '✅' : '❌'} 預設值 = null 的欄位，裝 null → 回來還是 null`)
  console.log(
    `   ${probe.hazardOK ? '✅' : '⚠️ '} 預設值 ≠ null 的欄位，裝 null → 回來變成 ${JSON.stringify(probe.recovered)}`,
  )
  if (!probe.hazardOK) {
    console.log('      規則：y-prosemirror 不儲存 null attr，回程一律由 schema 預設值填補。')
    console.log('      → schema 的鐵律：任何可能裝 null 的 attr，預設值必須也是 null。')
  }

  console.log('\n' + '='.repeat(60))
  console.log(ok ? '✅ 結論：往返等價，Q4 維持' : '❌ 結論：往返不等價，Q4 需重新評估（見上方差異明細）')
  process.exit(ok ? 0 : 1)
}

main()
