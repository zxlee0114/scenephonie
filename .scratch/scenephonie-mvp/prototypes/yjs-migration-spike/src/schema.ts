// 原型 —— 丟棄式程式碼。不要拿去 production。
//
// 這是票券 19 的 schema：**只用 prosemirror-model**，不含 Tiptap、不含 React、
// 不含任何瀏覽器相依。這正是票券 04 Q4 附帶規則 1 要求的形狀
//（「schema 是 isomorphic 的獨立模組，日後 y-prosemirror 吃同一份 schema」），
// 所以這支 spike 順便是那條規則的第一次實地檢驗。
//
// 節點型別涵蓋票券 19 指定的驗收素材：主場次、子場次（插入／接續）、
// 場次群組（多成員 + 交錯片段）、三種區塊、草稿場次、雜景場次（多值地點）。

import { Schema } from 'prosemirror-model'

/** 場次 metadata。雜景是唯一能讓 location 裝多值的逃生口（ADR-0004）。 */
const sceneMetaAttrs = {
  // 永久錨點（約束 1）。掉了它等於資料毀損。
  sceneId: { default: null as string | null },
  // 內 / 外 / 內外 / 雜景
  intExt: { default: '' },
  timeOfDay: { default: '' },
  // string，或雜景時的 string[]
  location: { default: '' as string | string[] },
  // 人物是實體引用（ADR-0005），不是字串
  characters: { default: [] as Array<{ id: string; displayName: string }> },
  // 群演。空字串是常態，用來一併驗「空值 attr」會不會在遷移中消失
  extras: { default: '' },
  // 草稿是推導出來的；資料模型只多這一個布林值（票券 11）
  manualDraft: { default: false },
}

export const schema = new Schema({
  nodes: {
    // 文件只由頂層場次組成 —— 場次之外沒有可編輯的空間（票券 03）
    doc: { content: 'topLevelScene+' },

    /**
     * 場次。主場次與子場次是同一個節點型別，差別只在 `kind`：
     * `null` = 主場次、`插入` / `接續` = 子場次（ADR-0003 / ADR-0006）。
     *
     * content 的 `sceneBlock+ scene*` 直接編碼 ADR-0006 不變式 ①：
     * 主場次的內容必須以自己的內容開始。
     */
    scene: {
      group: 'topLevelScene',
      content: 'sceneBlock+ scene*',
      defining: true,
      isolating: true,
      attrs: {
        ...sceneMetaAttrs,
        kind: { default: null as null | '插入' | '接續' },
      },
      toDOM: () => ['section', { 'data-type': 'scene' }, 0],
      parseDOM: [{ tag: 'section[data-type="scene"]' }],
    },

    /**
     * 場次群組 = N 個平行成員場次 + 一串有序片段（ADR-0004）。
     * 群組不佔場次號、不進場次表，只影響 PDF 的印法。
     */
    sceneGroup: {
      group: 'topLevelScene',
      content: 'groupMember+ fragment+',
      defining: true,
      isolating: true,
      attrs: {
        groupId: { default: null as string | null },
      },
      toDOM: () => ['section', { 'data-type': 'scene-group' }, 0],
      parseDOM: [{ tag: 'section[data-type="scene-group"]' }],
    },

    /**
     * 成員場次**沒有自己的內容** —— 內容在片段裡（ADR-0004）。
     * 這是 spike 裡唯一的 leaf node，順便驗「無內容節點」的 attrs 會不會掉。
     */
    groupMember: {
      content: '',
      atom: true,
      attrs: { ...sceneMetaAttrs },
      toDOM: () => ['div', { 'data-type': 'group-member' }],
      parseDOM: [{ tag: 'div[data-type="group-member"]' }],
    },

    /** 片段：一段內容 + 它屬於哪個成員。v1 的片段不給 id（ADR-0006）。 */
    fragment: {
      content: 'sceneBlock+',
      attrs: {
        memberSceneId: { default: null as string | null },
      },
      toDOM: () => ['div', { 'data-type': 'fragment' }, 0],
      parseDOM: [{ tag: 'div[data-type="fragment"]' }],
    },

    action: {
      group: 'sceneBlock',
      content: 'inline*',
      toDOM: () => ['p', { 'data-type': 'action' }, 0],
      parseDOM: [{ tag: 'p[data-type="action"]', priority: 1100 }],
    },

    dialogue: {
      group: 'sceneBlock',
      content: 'inline*',
      attrs: {
        character: { default: '' },
        // 發聲方式（票券 03 已決定但未實作）：一般 / V.O. / O.S.
        voice: { default: '一般' },
      },
      toDOM: () => ['p', { 'data-type': 'dialogue' }, 0],
      parseDOM: [{ tag: 'p[data-type="dialogue"]', priority: 1100 }],
    },

    insertShot: {
      group: 'sceneBlock',
      content: 'inline*',
      toDOM: () => ['p', { 'data-type': 'insert-shot' }, 0],
      parseDOM: [{ tag: 'p[data-type="insert-shot"]', priority: 1100 }],
    },

    text: { group: 'inline' },
  },

  marks: {
    /**
     * ⚠️ v1 **沒有** mark（票券 03 把 StarterKit 的粗體／斜體全關掉，落實約束 2）。
     * 這一個 mark 只為了票券 19 指定的第六項驗收（marks 是否等價）而存在 ——
     * 若日後長出任何 mark（例如註解），這裡已經先答過它遷不遷得過去。
     */
    emphasis: {
      attrs: { level: { default: 1 } },
      toDOM: () => ['em', 0],
      parseDOM: [{ tag: 'em' }],
    },
  },
})
