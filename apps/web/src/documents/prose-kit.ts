/**
 * 散文的編輯器那一半（票券 21）：故事大綱、分場大綱、自由文件，以及人物介紹每一位底下的介紹內文。
 * 節點對齊 `@scenephonie/schema` 的 `proseNodes` —— 寫入邊界照它驗證，這裡長不出它讀不懂的東西。
 */
import { textblockTypeInputRule } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * 簡單的富文本：第二、三層標題、項目與編號清單、引用、分隔線、粗體、斜體（2026-10-24 使用者裁決）。
 * 每一樣都有 Markdown 捷徑（`## `、`- `、`1. `、`> `、`---`、`**粗**`、`*斜*`），那是 StarterKit 內建的 input rule。
 *
 * 第一層標題留給文件名稱。其餘全關：底線、刪除線、連結、程式碼不在清單上；`hardBreak` 也關 ——
 * 一段就是一段，換段按 Enter。標題換成下面那個 `proseHeading`。
 *
 * `document: false`：頂層節點由文件自己給（人物介紹的頂層是一位一位人物，不是段落）。
 */
export function proseKit({ document = true, dropcursor = false }: { document?: boolean; dropcursor?: boolean } = {}) {
  return StarterKit.configure({
    document: document ? undefined : false,
    heading: false,
    hardBreak: false,
    codeBlock: false,
    strike: false,
    code: false,
    link: false,
    underline: false,
    dropcursor: dropcursor ? undefined : false,
    trailingNode: false,
  });
}

/**
 * 標題，捷徑**只在一般段落裡**生效。原生的 Heading 在標題裡也吃 `## `：標題打字打到
 * 「## 」開頭，那幾個字就被吃掉、只是又變成一次標題（票券 21 驗收）。捷徑剛轉換完時按一次 Backspace
 * 會退回原本打的字（Tiptap 內建），但那要先知道。
 *
 * `levels`：散文文件是 `[2, 3]`；人物介紹只有 `[3]`（第二層是人物的名字）。
 */
export function proseHeading(levels: (2 | 3)[]) {
  return Heading.extend({
    addInputRules() {
      return this.options.levels.map((level) => {
        const rule = textblockTypeInputRule({
          find: new RegExp(`^(#{${Math.min(...this.options.levels)},${level}})\\s$`),
          type: this.type,
          getAttributes: { level },
        });
        const convert = rule.handler;
        rule.handler = (props) =>
          props.state.doc.resolve(props.range.from).parent.type.name === "paragraph" ? convert(props) : null;
        return rule;
      });
    },
  }).configure({ levels });
}
