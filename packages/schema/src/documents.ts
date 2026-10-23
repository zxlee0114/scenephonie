/**
 * 劇本外文件（票券 21，§6.2、[ADR-0009](../../../docs/adr/0009-documents-hang-on-the-creative-unit-they-describe.md)）。
 *
 * 劇本之外、編劇另外寫的文件：交件大綱、分場大綱（角色設定表在下一片）。它們跟劇本一樣是
 * ProseMirror doc —— doc 是唯一權威（ADR-0007）—— 但**每個 kind 有自己的 node schema 與自己的
 * 遷移鏈**：兩份散文文件眼下長得一樣，卻不是同一個東西，日後各改各的，不准互相牽動。
 *
 * ── 不變式 F：kind 固定其合法層級 ──────────────────────────────────────
 * 文件掛在它描述的創作單位上：描述整部作品 → 專案；描述單一劇本 → 劇本。**層級是 kind 定義的
 * 一部分，不是資料的自由度** —— 沒有「這一份分場大綱掛專案」這種事。下面那張表是這條規則的
 * 權威；寫入路徑（persistence）照它拒絕違反者，資料庫的 CHECK（`documents_kind_level_check`）
 * 是它在資料層的抄本 —— 新增一種劇本層的 kind 時兩邊一起改。
 */
import { Schema, type Node as ProseMirrorNode } from "prosemirror-model";

/** 文件掛在哪一層。 */
export type DocumentLevel = "project" | "screenplay";

/**
 * 每個 kind 掛哪一層。kind 的值是領域詞彙（會被持久化），照 `CONTEXT.md` 詞條寫中文。
 *
 * - **交件大綱**（專案）：投稿時繳的那份全片大綱。可多份、各自命名，附字數計數器、不執行字數規則。
 * - **分場大綱**（劇本）：以場景為單位的規劃文件。自由文字、**不與場次關聯**。一份劇本一份。
 */
const LEVELS = {
  交件大綱: "project",
  分場大綱: "screenplay",
} as const satisfies Record<string, DocumentLevel>;

export type DocumentKind = keyof typeof LEVELS;
export type ProjectDocumentKind = { [K in DocumentKind]: (typeof LEVELS)[K] extends "project" ? K : never }[DocumentKind];

/** 這個 kind 的文件掛在哪一層（不變式 F）。 */
export function documentLevel(kind: DocumentKind): DocumentLevel {
  return LEVELS[kind];
}

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && Object.hasOwn(LEVELS, value);
}

/**
 * 散文文件的節點：一串段落，段落裡只有字。
 *
 * 沒有標題、清單、粗斜體 —— 約束 2（資料模型不含呈現性資訊），而且兩份文件都沒有規定格式；
 * 「整齊」是 PDF 模板的責任。`doc` 寫 `block+` 而不是 `paragraph+`，是為了跟編輯器那一半
 * （Tiptap 的 `Document`）同一條內容規則。
 */
const proseSpec = {
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    text: {},
  },
  marks: {},
};

/**
 * 每個 kind 一個 schema 實體。**刻意不共用同一個物件**：共用的話，有人為交件大綱加一個節點，
 * 分場大綱就默默跟著變了 —— 而它的 schema 版本號不會跟著 +1。
 */
const SCHEMAS: Record<DocumentKind, Schema> = {
  交件大綱: new Schema(proseSpec),
  分場大綱: new Schema(proseSpec),
};

export function documentSchema(kind: DocumentKind): Schema {
  return SCHEMAS[kind];
}

/** 讀取／寫入邊界的 canonical 驗證：照這個 kind 的 schema hydrate，不合就丟例外。 */
export function documentFromJSON(kind: DocumentKind, json: unknown): ProseMirrorNode {
  const doc = SCHEMAS[kind].nodeFromJSON(json);
  doc.check();
  return doc;
}

/** 一份空的文件：一個空段落（`block+` 至少要有一塊）。 */
export function emptyDocument(): Record<string, unknown> {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * 字數 —— 交件大綱的計數器（§9.7）。叫 `wordCount` 不叫字元數：一個英文單字算一個，跟 Word 一樣。**只計數、不執行規則**：上限是各案特例（GHSA 800–1200／TFC
 * 無上限／高雄拍 500…），寫死任何一個數字都是錯的。
 *
 * 算法照 Word 的「字數」：中日韓文字與全形標點**一個字算一個**，連續的英數（含黏在上面的半形
 * 標點）**算一個字**，空白不算。照 Word 是因為編劇與主辦單位核對字數時手上拿的就是它 ——
 * 我們的數字跟它不一樣，編劇得先搞清楚該信哪一個。
 */
export function wordCount(doc: ProseMirrorNode): number {
  // 段落之間插一個換行，否則上一段結尾與下一段開頭的英文單字會被接成一個。
  const text = doc.textBetween(0, doc.content.size, "\n");
  let count = 0;
  let inWord = false;
  for (const char of text) {
    if (/\s/u.test(char)) {
      inWord = false;
    } else if (WIDE.test(char)) {
      count += 1;
      inWord = false;
    } else if (!inWord) {
      count += 1;
      inWord = true;
    }
  }
  return count;
}

/** 一個字算一個的那些：漢字、假名、諺文、CJK 標點、全形字元，以及中文常用的引號、破折號、刪節號。 */
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef\u2014\u2018-\u201d\u2026]/u;
