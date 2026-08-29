// 票券 19 指定的驗收素材：一份涵蓋所有已定案節點型別的 doc。
//
// 主場次 ✓ 子場次（插入 ✓ 接續 ✓）✓ 場次群組（多成員 + 交錯片段）✓
// 三種區塊（動作 ✓ 對白 ✓ 插入畫面 ✓）✓ 草稿場次 ✓ 雜景場次（多值地點）✓
//
// 除了節點型別，這份 fixture 還刻意埋了幾個**遷移最容易掉東西的形狀**：
// 陣列 attr（characters）、布林 attr（manualDraft）、null attr（kind）、
// 空字串 attr（extras）、非預設數字 attr（mark 的 level）、
// leaf node 的 attrs（groupMember）、以及中文與 emoji 文字。

import { Node } from 'prosemirror-model'
import { schema } from './schema.ts'

const 若晴 = { id: 'chr_ruoqing', displayName: '若晴' }
const 志豪 = { id: 'chr_zhihao', displayName: '志豪' }

const text = (s: string) => ({ type: 'text', text: s })

const action = (s: string) => ({ type: 'action', content: [text(s)] })

const dialogue = (character: string, s: string, voice = '一般') => ({
  type: 'dialogue',
  attrs: { character, voice },
  content: [text(s)],
})

const insertShot = (s: string) => ({ type: 'insertShot', content: [text(s)] })

export const fixtureJSON = {
  type: 'doc',
  content: [
    // ── 1. 主場次（完整 metadata、三種區塊全到齊、含 mark）
    {
      type: 'scene',
      attrs: {
        sceneId: 'scn_0001',
        kind: null,
        intExt: '內',
        timeOfDay: '日',
        location: '若晴家 客廳',
        characters: [若晴, 志豪],
        extras: '鄰居兩名',
        manualDraft: false,
      },
      content: [
        action('若晴推開門，屋裡沒開燈。'),
        {
          type: 'action',
          content: [
            text('桌上擺著一封信，'),
            {
              type: 'text',
              text: '沒有署名',
              marks: [{ type: 'emphasis', attrs: { level: 2 } }],
            },
            text('。'),
          ],
        },
        dialogue('若晴', '你回來了？'),
        dialogue('志豪', '嗯。', 'O.S.'),
        insertShot('信封上的郵戳 —— 三年前的日期。'),

        // ── 1a. 子場次：插入戲（閃回）
        {
          type: 'scene',
          attrs: {
            sceneId: 'scn_0002',
            kind: '插入',
            intExt: '外',
            timeOfDay: '昏',
            location: '海邊 堤防',
            characters: [若晴],
            extras: '',
            manualDraft: false,
          },
          content: [action('三年前。若晴站在堤防上，手裡捏著同一封信。')],
        },

        // ── 1b. 子場次：接續（連續動作走進另一個空間）
        {
          type: 'scene',
          attrs: {
            sceneId: 'scn_0003',
            kind: '接續',
            intExt: '內',
            timeOfDay: '日',
            location: '若晴家 廚房',
            characters: [若晴, 志豪],
            extras: '',
            manualDraft: false,
          },
          content: [
            action('兩人走進廚房。'),
            dialogue('志豪', '那封信我看過了。'),
          ],
        },
      ],
    },

    // ── 2. 場次群組：兩個平行成員 + 四個交錯片段（對剪）
    {
      type: 'sceneGroup',
      attrs: { groupId: 'grp_0001' },
      content: [
        {
          type: 'groupMember',
          attrs: {
            sceneId: 'scn_0004',
            intExt: '內',
            timeOfDay: '夜',
            location: '警局 偵訊室',
            characters: [若晴],
            extras: '員警數名',
            manualDraft: false,
          },
        },
        {
          type: 'groupMember',
          attrs: {
            sceneId: 'scn_0005',
            intExt: '內',
            timeOfDay: '夜',
            location: '港邊 倉庫',
            characters: [志豪],
            extras: '',
            manualDraft: false,
          },
        },
        {
          type: 'fragment',
          attrs: { memberSceneId: 'scn_0004' },
          content: [dialogue('若晴', '我什麼都不知道。')],
        },
        {
          type: 'fragment',
          attrs: { memberSceneId: 'scn_0005' },
          content: [action('志豪拉開鐵門，海風灌進來。')],
        },
        {
          type: 'fragment',
          attrs: { memberSceneId: 'scn_0004' },
          content: [
            action('偵訊室的燈閃了一下。'),
            dialogue('若晴', '……那天他確實來過。'),
          ],
        },
        // 折返：scn_0005 貢獻第二段不相鄰的內容（ADR-0006）
        {
          type: 'fragment',
          attrs: { memberSceneId: 'scn_0005' },
          content: [insertShot('倉庫地上的拖行痕跡。')],
        },
      ],
    },

    // ── 3. 雜景場次：內外＝雜景，location 裝多值（場次定義唯一的逃生口）
    {
      type: 'scene',
      attrs: {
        sceneId: 'scn_0006',
        kind: null,
        intExt: '雜景',
        timeOfDay: '日',
        location: ['市場', '公車站', '國小門口', '河堤'],
        characters: [],
        extras: '路人若干',
        manualDraft: false,
      },
      content: [action('城市醒來。市場、公車站、國小門口、河堤，人來人往。')],
    },

    // ── 4. 草稿場次：手動標記，且 metadata 刻意不完整
    {
      type: 'scene',
      attrs: {
        sceneId: 'scn_0007',
        kind: null,
        intExt: '',
        timeOfDay: '',
        location: '',
        characters: [],
        extras: '',
        manualDraft: true,
      },
      content: [action('（還沒想好：志豪要不要在這裡就承認？）🫠')],
    },
  ],
}

/** 從 JSON 生出真正的 PM Node —— 順便讓 schema 驗證這份 fixture 合法。 */
export const fixtureDoc: Node = Node.fromJSON(schema, fixtureJSON)
