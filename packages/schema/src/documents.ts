/**
 * 劇本外文件（票券 21，§6.2、[ADR-0009](../../../docs/adr/0009-documents-hang-on-the-creative-unit-they-describe.md)）。
 *
 * 劇本之外、編劇另外寫的文件：交件大綱、分場大綱、自由文件、角色設定表。它們跟劇本一樣是
 * ProseMirror doc —— doc 是唯一權威（ADR-0007）—— 但**每個 kind 有自己的 node schema 與自己的
 * 遷移鏈**：三份散文文件眼下長得一樣，卻不是同一個東西，日後各改各的，不准互相牽動。
 *
 * ── 不變式 F：kind 固定其合法層級 ──────────────────────────────────────
 * 文件掛在它描述的創作單位上：描述整部作品 → 專案；描述單一劇本 → 劇本。**層級是 kind 定義的
 * 一部分，不是資料的自由度** —— 沒有「這一份分場大綱掛專案」這種事。下面那張表是這條規則的
 * 權威；寫入路徑（persistence）照它拒絕違反者，資料庫的 CHECK（`documents_kind_level_check`）
 * 是它在資料層的抄本 —— 新增一種劇本層的 kind 時兩邊一起改。
 *
 * 掛載是資料的規則，不是畫面的分類：單一劇本專案的 hub 把所有文件列成一份清單（§7.10），
 * 編劇不需要知道哪一份掛在哪個創作單位上。
 */
import { Schema, type Node as ProseMirrorNode } from "prosemirror-model";

import { isCharacterId } from "./entities";

/** 文件掛在哪一層。 */
export type DocumentLevel = "project" | "screenplay";

/**
 * 每個 kind 掛哪一層、是不是固定的那一份。kind 的值是領域詞彙（會被持久化），照 `CONTEXT.md` 詞條寫中文；
 * 畫面上的名字另外給（交件大綱在畫面上叫「故事大綱」）。
 *
 * - **交件大綱**（專案，固定）：投稿時繳的那份全片大綱。一個專案一份，附字數計數器、不執行字數規則。
 * - **分場大綱**（劇本，固定）：以場景為單位的規劃文件。**不與場次關聯**。一份劇本一份。
 * - **自由文件**（專案，可多份）：編劇自己命名、用途不限（世界觀、研究筆記、另一個字數的大綱版本……）。
 * - **角色設定表**（專案，固定）：有序的人物引用清單，畫面上叫「人物介紹」。不是散文 —— 見 `characterSheetSpec`。
 *
 * **固定**＝那個創作單位底下恰好一份，第一次打開時建立，不能改名、不能刪。
 */
const KINDS = {
  交件大綱: { level: "project", fixed: true },
  分場大綱: { level: "screenplay", fixed: true },
  自由文件: { level: "project", fixed: false },
  角色設定表: { level: "project", fixed: true },
} as const satisfies Record<string, { level: DocumentLevel; fixed: boolean }>;

export type DocumentKind = keyof typeof KINDS;

/** 這個 kind 的文件掛在哪一層（不變式 F）。 */
export function documentLevel(kind: DocumentKind): DocumentLevel {
  return KINDS[kind].level;
}

/** 這個 kind 是不是「每個創作單位恰好一份」的固定文件。 */
export function isFixedDocument(kind: DocumentKind): boolean {
  return KINDS[kind].fixed;
}

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && Object.hasOwn(KINDS, value);
}

/**
 * 散文文件的節點：段落、第二與第三層標題、項目與編號清單、引用、分隔線；字上可以有粗體與斜體。
 *
 * **約束 2 管的是劇本，不是這裡**：劇本的格式由模板決定，所以劇本沒有粗斜體；散文文件裡的標題與強調
 * 是作者寫下的內容（2026-10-24 使用者裁決 —— 比賽很多、也不一定拿去交件，作者有自己的寫法）。
 * 刻意不放的：第一層標題（留給文件名稱）、底線、顏色、字級、連結、圖片、表格、程式碼。
 *
 * 節點名與屬性對齊編輯器那一半（Tiptap StarterKit 的同名 extension），寫入邊界才讀得懂它存下來的東西。
 * `doc` 寫 `block+` 而不是 `paragraph+`，同樣是為了跟 Tiptap 的 `Document` 同一條內容規則。
 */
const HEADING_LEVELS: readonly number[] = [2, 3];

const proseSpec = {
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    heading: {
      content: "text*",
      group: "block",
      defining: true,
      attrs: {
        level: {
          default: 2,
          validate: (value: unknown) => {
            if (typeof value !== "number" || !HEADING_LEVELS.includes(value)) {
              throw new RangeError(`標題只有第 ${HEADING_LEVELS.join("、")} 層，沒有 ${String(value)}`);
            }
          },
        },
      },
    },
    blockquote: { content: "block+", group: "block", defining: true },
    bulletList: { content: "listItem+", group: "block" },
    orderedList: { content: "listItem+", group: "block", attrs: { start: { default: 1 }, type: { default: null } } },
    listItem: { content: "paragraph block*", defining: true },
    horizontalRule: { group: "block" },
    text: {},
  },
  marks: {
    bold: {},
    italic: {},
  },
};

/**
 * 角色設定表：每個節點一筆人物引用 `{ characterId }`，順序就是節點的順序（§6.2）。
 *
 * **人物介紹的內文不在這裡**，在人物實體的描述欄上（CONTEXT「角色設定表」）—— 人物屬於專案，描述是關於
 * 那個人的事實，掛在表上會讓同一個人在不同文件裡分岔。也沒有顯示名：表上印的就是實體的名字，
 * 這裡沒有「這一場叫他什麼」可言。
 *
 * 選 PM doc 而不是關聯表，是為了讓引用只有一種住所（ADR-0007）—— 那個選擇有有效期，見規格 §6.2 的警示。
 *
 * `doc` 寫 `characterEntry*`：零筆是合法的（還沒收錄任何人），而且 `characterId` 沒有預設值的節點放不進
 * 必填位置（ProseMirror 的 generatable 檢查，同劇本的 `scene*`）。
 */
const characterSheetSpec = {
  nodes: {
    doc: { content: "characterEntry*" },
    characterEntry: {
      atom: true,
      attrs: {
        characterId: {
          validate: (value: unknown) => {
            if (!isCharacterId(value)) throw new RangeError(`角色設定表只收人物，「${String(value)}」不是人物 id`);
          },
        },
      },
    },
    text: {},
  },
};

/**
 * 每個 kind 一個 schema 實體。**刻意不共用同一個物件**：共用的話，有人為交件大綱加一個節點，
 * 分場大綱就默默跟著變了 —— 而它的 schema 版本號不會跟著 +1。
 */
const SCHEMAS: Record<DocumentKind, Schema> = {
  交件大綱: new Schema(proseSpec),
  分場大綱: new Schema(proseSpec),
  自由文件: new Schema(proseSpec),
  角色設定表: new Schema(characterSheetSpec),
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

/** 一份空的文件。散文文件是一個空段落（`block+` 至少要有一塊）；角色設定表是零筆。 */
export function emptyDocument(kind: DocumentKind): Record<string, unknown> {
  if (kind === "角色設定表") return { type: "doc", content: [] };
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * 字數 —— 每份散文文件的計數器（§9.7）。叫 `wordCount` 不叫字元數：一個英文單字算一個，跟 Word 一樣。
 * **只計數、不執行規則**：上限是各案特例（GHSA 800–1200／TFC 無上限／高雄拍 500…），寫死任何一個數字都是錯的。
 * 標題、清單、引用裡的字照算；不算的只有格式本身（粗體、標題、清單這些標記不是字）。
 *
 * 算法照 Word 的「字數」：中日韓文字與全形標點**一個字算一個**，連續的英數（含黏在上面的半形
 * 標點）**算一個字**，空白不算。照 Word 是因為編劇與主辦單位核對字數時手上拿的就是它 ——
 * 我們的數字跟它不一樣，編劇得先搞清楚該信哪一個。
 */
export function wordCount(doc: ProseMirrorNode): number {
  // 區塊之間插一個換行，否則上一塊結尾與下一塊開頭的英文單字會被接成一個（清單項目、標題也是區塊）。
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
