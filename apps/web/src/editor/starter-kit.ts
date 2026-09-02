/**
 * StarterKit 的共用設定 —— schema 等價測試與真實編輯器必須用同一份，否則兩邊 schema 會分岔。
 *
 * 只留 `text`（`group: "inline"`，與 kernel 一致）與 `undoRedo`（history）。其餘全關：
 * - `document`／`paragraph`／`heading`…：文件是 `scene*`，頂層與場次內都沒有它們的容身處。
 * - `bold`／`italic`／`strike`／`code`：約束 2 —— 資料模型不含呈現性資訊。
 * - `hardBreak`：佔用 `Mod-Enter`，會跟「新增下一場」搶（§7.1）；劇本也用不到軟換行。
 * - `gapcursor`：會在場次之間放一個（非文字）游標位 —— 與「場次之外不存在 canonical text
 *   insertion point」相斥（§7.9）。`dropcursor`：拖曳排序延到票券 13。
 */
import { StarterKit } from "@tiptap/starter-kit";

export const STARTER_KIT_CONFIG = {
  document: false,
  paragraph: false,
  heading: false,
  hardBreak: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  listKeymap: false,
  codeBlock: false,
  horizontalRule: false,
  bold: false,
  italic: false,
  strike: false,
  code: false,
  link: false,
  underline: false,
  dropcursor: false,
  gapcursor: false,
  trailingNode: false,
} as const;

export const baseStarterKit = () => StarterKit.configure(STARTER_KIT_CONFIG);
