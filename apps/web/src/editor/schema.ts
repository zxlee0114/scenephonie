/**
 * 編輯器 schema —— kernel node spec 的「view 半邊」（規格 §5.5：node spec 與 node view 分家）。
 *
 * canonical node spec 的權威是 `@scenephonie/schema` 的 `schema`（`new Schema()`，isomorphic、
 * 零瀏覽器相依）。這裡用 Tiptap `Node.create` **重現同一組節點**，只補 kernel 刻意不含的那半：
 * `renderHTML`／`parseHTML`（剪貼簿往返要）。node view（React）再由 `./nodes/*` 疊上去 ——
 * 本檔不含 `addNodeView`，好讓 `schema-equivalence.test.ts` 能在無 React 根的情況下建 Editor。
 *
 * **對齊清單**（`schema-equivalence.test.ts` 逐項斷言）：節點名集合、每個節點的 attr 名集合、
 * `isolating`／`defining`、`doc` 與 `scene` 的內容規則、marks 全關。attr 的 `validate` 不在這裡
 * 重複 —— canonical 驗證發生在讀取邊界（`docFromJSON`），編輯器對輸入寬容（§6.6）。
 */
import { Node } from "@tiptap/core";

/** kernel scene attr 的預設。Tiptap 要求每個 attr 有 default；kernel 的 `sceneId` 無 default，
 * 這裡給 `null`，但 StableIds plugin 與 command 層保證它恆有真值（見 `./extensions/dedupe`）。 */
const SCENE_ATTRS = {
  sceneId: { default: null as string | null },
  time: { default: null as string | null },
  intExt: { default: null as string | null },
  location: { default: null as unknown },
  appearingCharacters: { default: null as unknown },
  extras: { default: [] as unknown[] },
  dismissedCharacterIds: { default: [] as string[] },
  manualDraft: { default: false },
} as const;

/** 場次 attr 在 DOM 上的攜帶方式：物件／陣列走 JSON 字串，純量直接放 data-*。 */
function jsonAttr(name: string) {
  return {
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(`data-${name}`);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[name] == null ? {} : { [`data-${name}`]: JSON.stringify(attrs[name]) },
  };
}

export const Doc = Node.create({
  name: "doc",
  topNode: true,
  // §5.1 意圖 scene+；kernel 因 sceneId 無 default（非 generatable）放寬為 scene*。
  // 「至少一場」由編輯器初始 doc 保證（use-screenplay-editor.ts），不是 schema 能表達的。
  content: "scene*",
});

export const Scene = Node.create({
  name: "scene",
  group: "block",
  content: "sceneBlock+",
  // isolating：跨場次的鍵盤選取／刪除不會把兩場合併（sceneId 錨點隨之消失）。
  isolating: true,
  // defining：貼上時保留自己的結構。
  defining: true,
  marks: "",
  selectable: true,
  addAttributes() {
    return {
      sceneId: {
        default: SCENE_ATTRS.sceneId.default,
        parseHTML: (el) => el.getAttribute("data-scene-id"),
        renderHTML: (attrs) =>
          attrs.sceneId == null ? {} : { "data-scene-id": attrs.sceneId as string },
      },
      time: { default: SCENE_ATTRS.time.default },
      intExt: { default: SCENE_ATTRS.intExt.default },
      location: { default: SCENE_ATTRS.location.default, ...jsonAttr("location") },
      appearingCharacters: {
        default: SCENE_ATTRS.appearingCharacters.default,
        ...jsonAttr("appearing-characters"),
      },
      extras: { default: [...SCENE_ATTRS.extras.default], ...jsonAttr("extras") },
      dismissedCharacterIds: {
        default: [...SCENE_ATTRS.dismissedCharacterIds.default],
        ...jsonAttr("dismissed-character-ids"),
      },
      manualDraft: {
        default: SCENE_ATTRS.manualDraft.default,
        parseHTML: (el) => el.getAttribute("data-manual-draft") === "true",
        renderHTML: (attrs) => (attrs.manualDraft ? { "data-manual-draft": "true" } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'section[data-type="scene"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-type": "scene" }, 0];
  },
});

/** 三種 sceneBlock 共用的建構 —— priority 1100 壓過 StarterKit Paragraph 的 1000（§7.7）。 */
function sceneBlock(name: string, dataType: string, attributes?: () => Record<string, unknown>) {
  return Node.create({
    name,
    group: "sceneBlock",
    content: "inline*",
    marks: "",
    priority: 1100,
    /**
     * **區塊內的空白是內容，不要正規化**（票券 28）。
     *
     * 這一行是 `Shift+Enter` 軟換行（`extensions/soft-break` 插的那個 `\n`）能活下來的
     * 唯一理由。ProseMirror 每次從 DOM 讀回變動（`readDOMChange` → `parseBetween`）都會依
     * 游標所在**區塊型別**決定要不要保留空白：
     *
     *   preserveWhitespace: $from.parent.type.whitespace == "pre" ? "full" : true
     *                                                    （prosemirror-view）
     *
     * 而 `true`（不是 `"full"`）那條路會執行 `value.replace(/\r?\n|\r/g, " ")`
     * （prosemirror-model）—— **明文把換行換成一個半形空格**。沒有這一行的話，`\n` 在
     * 按下 `Shift+Enter` 的當下是好的（畫面真的換行、caret 真的在第二行），但**打下一個字
     * 的瞬間就被洗成空格**，整段塌回一行。症狀看起來像「游標跳回第一行」，其實是換行字元
     * 被刪掉了（票券 28 的原始診斷因此指錯方向，見該票 Comments）。
     *
     * kernel schema（`@scenephonie/schema`）不需要這一行 —— 它 isomorphic、永遠不碰 DOM，
     * `docFromJSON` 走 JSON 不走 parser。`whitespace` 是 DOM parse 的提示，屬 view 半邊，
     * 所以 `schema-equivalence.test.ts` 的對齊清單不含它。
     */
    whitespace: "pre" as const,
    ...(attributes ? { addAttributes: attributes } : {}),
    parseHTML() {
      return [{ tag: `p[data-type="${dataType}"]` }];
    },
    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
      return ["p", { ...HTMLAttributes, "data-type": dataType }, 0];
    },
  });
}

export const Action = sceneBlock("action", "action");

export const Dialogue = sceneBlock("dialogue", "dialogue", () => ({
  // 人物引用 { id, displayName }；可為 null（尚未指定說話者）。走 JSON attr，同場次的實體引用。
  character: { default: null, ...jsonAttr("character") },
  // 發聲方式：不允許 null，default '一般'（§5.3）。
  voiceStyle: {
    default: "一般",
    parseHTML: (el: HTMLElement) => el.getAttribute("data-voice-style") ?? "一般",
    renderHTML: (attrs: Record<string, unknown>) => ({
      "data-voice-style": (attrs.voiceStyle as string) ?? "一般",
    }),
  },
}));

export const InsertShot = sceneBlock("insertShot", "insert-shot");

/**
 * schema-only 擴充集（無 node view）。真實編輯器用 `./nodes` 疊 view 後的版本；
 * 等價測試直接用這一組。`text` 由 StarterKit 提供（`group: "inline"`，與 kernel 一致）。
 */
export const sceneSchemaNodes = [Doc, Scene, Action, Dialogue, InsertShot] as const;

/** kernel 的 scene attr 名（唯一事實來源在 `@scenephonie/schema` 的 schema.ts；這裡用於斷言）。 */
export const SCENE_ATTR_NAMES = Object.keys(SCENE_ATTRS);
