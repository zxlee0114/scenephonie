import { and, asc, eq, isNotNull, isNull, lt, type SQL } from "drizzle-orm";

import {
  documentFromJSON,
  documentLevel,
  emptyDocument,
  isDocumentKind,
  mintId,
  wordCount,
  type DocumentKind,
} from "@scenephonie/schema";

import type { AuthorizedProject, AuthorizedScreenplay } from "@/authorization";
import { getDb } from "@/db/client";
import { documents } from "@/db/schema";

import type { PersistedDoc } from "./doc-schema-version";
import { CURRENT_DOCUMENT_SCHEMA_VERSIONS, migrateDocumentToCurrent } from "./document-schema-version";
import { decodeSaveToken, encodeSaveToken, type SaveToken } from "./save-token";

/**
 * 劇本外文件的存／載（票券 21，§6.2、ADR-0009）。
 *
 * 與 `screenplay-store.ts` 同一套承諾：整份 doc 覆蓋、`doc_seq` 樂觀並行、lazy 遷移、讀取路徑不寫回。
 * 不同的只有兩件事：
 *
 * 1. **掛哪一層由 kind 決定（不變式 F）**。每一支吃的 handle 就是那一層 —— 專案層的文件吃
 *    `AuthorizedProject`、劇本層的吃 `AuthorizedScreenplay` —— 查詢條件同時鎖住 `project_id` 與
 *    `screenplay_id`（專案層＝`is null`），所以一份文件**只有一個合法位址**：分場大綱從專案層讀不到，
 *    交件大綱從劇本層讀不到。建立時照 `documentLevel` 拒絕掛錯層的 —— 型別已經擋住，執行期再擋一次，
 *    因為「型別說不行」擋不住 `as`。
 * 2. **每個 kind 有自己的遷移鏈**（`document-schema-version.ts`）。
 *
 * 固定文件（交件大綱、分場大綱）每個創作單位恰好一份，第一次打開時建立，不能改名、不能刪；
 * 自由文件由編劇明確新增，可以改名、可以刪。刪除是先標記（`deleted_at`），排程過了期限才真的清掉。
 *
 * 沒有備份：§6.7 的自動備份只承諾劇本。
 */

const DOCUMENT_ID_PREFIX = "dc_";

/**
 * 一份文件描述的那個**創作單位**的 handle（ADR-0009）：整部作品 → 專案；單一劇本 → 劇本。
 * 文件掛在哪、從哪讀、存到哪，都是問這一個。
 */
export type CreativeUnit = AuthorizedProject | AuthorizedScreenplay;

/** hub 列清單用：不帶內文、不含已刪除的。 */
export type DocumentSummary = {
  documentId: string;
  kind: DocumentKind;
  /** 編劇給自由文件的名字；`null` ＝ 沒命名（固定文件永遠是 `null`）。 */
  title: string | null;
  /** 最後一次存檔或改名的時刻。 */
  updatedAt: Date;
  /** 字數（同編輯器裡的計數器）。 */
  words: number;
};

/** 一份載進記憶體的文件。`token` 是不透明的 —— 存檔時原封帶回。 */
export type LoadedDocument = {
  documentId: string;
  kind: DocumentKind;
  title: string | null;
  body: PersistedDoc;
  token: SaveToken;
};

export type DocumentSaveResult =
  | { status: "saved"; token: SaveToken }
  /** 別處改過了、或這份文件不在這個 handle 底下（兩者對呼叫端是同一件事：這次寫入沒有落點）。 */
  | { status: "conflict" };

const isScreenplayUnit = (unit: CreativeUnit): unit is AuthorizedScreenplay => "screenplayId" in unit;

/** 「這份文件就在這個 handle 底下」—— 專案與劇本兩個欄位一起鎖。不分刪了沒。 */
function inUnitIncludingDeleted(unit: CreativeUnit): SQL {
  return and(
    eq(documents.projectId, unit.projectId),
    isScreenplayUnit(unit) ? eq(documents.screenplayId, unit.screenplayId) : isNull(documents.screenplayId),
  )!;
}

/** 「這份文件就在這個 handle 底下，而且沒被刪」—— 除了復原，每一支都問這個。 */
function inUnit(unit: CreativeUnit): SQL {
  return and(inUnitIncludingDeleted(unit), isNull(documents.deletedAt))!;
}

/** 編劇明確新增的那一種：可以改名、可以刪。 */
const FREE_DOCUMENT = "自由文件" satisfies DocumentKind;

/** 不變式 F 的寫入側：kind 掛的那一層必須就是 handle 的那一層。 */
function assertLevel(unit: CreativeUnit, kind: DocumentKind): void {
  const level = isScreenplayUnit(unit) ? "screenplay" : "project";
  if (!isDocumentKind(kind) || documentLevel(kind) !== level) {
    throw new Error(`不變式 F：${String(kind)}不能掛在${level === "project" ? "專案" : "劇本"}上`);
  }
}

/** 一份新文件的那一列：內文從一個空段落開始、版本是該 kind 的現行版本。先過不變式 F。 */
function newRow(unit: CreativeUnit, kind: DocumentKind, title: string | null) {
  assertLevel(unit, kind);
  return {
    id: mintId(DOCUMENT_ID_PREFIX),
    projectId: unit.projectId,
    screenplayId: isScreenplayUnit(unit) ? unit.screenplayId : null,
    kind,
    title,
    body: emptyDocument(),
    docSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSIONS[kind],
    docSeq: 0,
  };
}

/** 在專案底下新增一份自由文件（可多份）。內文從一個空段落開始。 */
export async function createFreeDocument(
  project: AuthorizedProject,
  { title = null }: { title?: string | null },
): Promise<LoadedDocument> {
  const row = newRow(project, FREE_DOCUMENT, normalizeTitle(title));
  await getDb().insert(documents).values(row);
  return { documentId: row.id, kind: FREE_DOCUMENT, title: row.title, body: row.body, token: encodeSaveToken(row.docSeq) };
}

/** 這個專案的交件大綱 —— 一個專案一份，第一次打開時建立。 */
export function openSubmissionOutline(project: AuthorizedProject): Promise<LoadedDocument> {
  return openFixed(project, "交件大綱");
}

/** 這份劇本的分場大綱 —— 一份劇本一份，第一次打開時建立。 */
export function openSceneOutline(screenplay: AuthorizedScreenplay): Promise<LoadedDocument> {
  return openFixed(screenplay, "分場大綱");
}

/**
 * 固定文件的 get-or-create。
 *
 * 兩個分頁同時第一次打開時，那個 kind 的 partial unique index 把兩次插入排成序：晚到的那次什麼都不寫，
 * 接著讀到先到的那一份。
 */
async function openFixed(unit: CreativeUnit, kind: DocumentKind): Promise<LoadedDocument> {
  await getDb().insert(documents).values(newRow(unit, kind, null)).onConflictDoNothing();

  const [row] = await getDb()
    .select({ id: documents.id })
    .from(documents)
    .where(and(inUnit(unit), eq(documents.kind, kind)))
    .limit(1);
  const loaded = row && (await loadDocument(unit, row.id));
  if (!loaded) throw new Error(`${kind}剛建立卻讀不到 —— 這代表寫入沒有落地`);
  return loaded;
}

/** 這個專案的所有文件（兩層都列、已刪除的不列），早建立的在前。 */
export async function listDocuments(project: AuthorizedProject): Promise<DocumentSummary[]> {
  const rows = await getDb()
    .select({
      documentId: documents.id,
      kind: documents.kind,
      title: documents.title,
      updatedAt: documents.updatedAt,
      body: documents.body,
      docSchemaVersion: documents.docSchemaVersion,
    })
    .from(documents)
    .where(and(eq(documents.projectId, project.projectId), isNull(documents.deletedAt)))
    .orderBy(asc(documents.createdAt), asc(documents.id));
  // 認不得的 kind（rolling deploy 時新版程式碼寫進來的）不列 —— 這份程式碼不知道它掛哪一層。
  // 字數照讀取路徑的規矩算：先在記憶體遷移到現行版本，再照那個 kind 的 schema 讀。
  return rows.flatMap(({ body, docSchemaVersion, ...row }) => {
    if (!isDocumentKind(row.kind)) return [];
    const current = migrateDocumentToCurrent(row.kind, body as PersistedDoc, docSchemaVersion);
    return [{ ...row, kind: row.kind, words: wordCount(documentFromJSON(row.kind, current)) }];
  });
}

/**
 * 載入一份文件。舊版在**記憶體中**沿那個 kind 的鏈帶到現行版本，讀取路徑一律不寫回（§6.7）。
 *
 * @returns 不在這個 handle 底下（別人的、掛在另一層、已刪除）就是 `null`。
 */
export async function loadDocument(unit: CreativeUnit, documentId: string): Promise<LoadedDocument | null> {
  const [row] = await getDb()
    .select({
      documentId: documents.id,
      kind: documents.kind,
      title: documents.title,
      body: documents.body,
      docSchemaVersion: documents.docSchemaVersion,
      docSeq: documents.docSeq,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), inUnit(unit)))
    .limit(1);
  if (!row || !isDocumentKind(row.kind)) return null;

  return {
    documentId: row.documentId,
    kind: row.kind,
    title: row.title,
    body: migrateDocumentToCurrent(row.kind, row.body as PersistedDoc, row.docSchemaVersion),
    token: encodeSaveToken(row.docSeq),
  };
}

/**
 * 存一份文件：doc 覆蓋、版本帶到該 kind 的現行版本、`doc_seq` 遞增 —— 同一個交易。
 *
 * **寫入邊界的 canonical 驗證**：照那個 kind 的 schema hydrate 不起來就丟例外（同劇本存檔那道關卡）——
 * 壞掉的 body 只會是一次大聲的失敗，不會變成壞掉的文件。
 */
export async function saveDocument({
  unit,
  documentId,
  body,
  token,
}: {
  unit: CreativeUnit;
  documentId: string;
  body: PersistedDoc;
  token: SaveToken;
}): Promise<DocumentSaveResult> {
  const expectedDocSeq = decodeSaveToken(token);
  if (expectedDocSeq === null) return { status: "conflict" };

  return getDb().transaction(async (tx): Promise<DocumentSaveResult> => {
    const [current] = await tx
      .select({ kind: documents.kind, docSeq: documents.docSeq })
      .from(documents)
      .where(and(eq(documents.id, documentId), inUnit(unit)))
      .limit(1)
      .for("update");
    if (!current || !isDocumentKind(current.kind) || current.docSeq !== expectedDocSeq) return { status: "conflict" };

    documentFromJSON(current.kind, body);

    const nextDocSeq = current.docSeq + 1;
    await tx
      .update(documents)
      .set({
        body,
        docSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSIONS[current.kind],
        docSeq: nextDocSeq,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
    return { status: "saved", token: encodeSaveToken(nextDocSeq) };
  });
}

/**
 * 自由文件改名。名字不是內文 —— 不動 `doc_seq`，另一個分頁的存檔不會因為這裡改了名字而衝突。
 *
 * @returns 不是這個專案的自由文件（別人的、固定文件、已刪除）就是 `false`。
 */
export async function renameDocument(project: AuthorizedProject, documentId: string, title: string): Promise<boolean> {
  const renamed = await getDb()
    .update(documents)
    .set({ title: normalizeTitle(title), updatedAt: new Date() })
    .where(and(eq(documents.id, documentId), inUnit(project), eq(documents.kind, FREE_DOCUMENT)))
    .returning({ id: documents.id });
  return renamed.length > 0;
}

/**
 * 刪一份自由文件：當下就從清單與每一支讀寫消失，但列還在，`restoreDocument` 救得回來。
 * 不動 `doc_seq` —— 復原之後，刪除前那個分頁手上的 token 仍然接得上。
 *
 * @returns 不是這個專案的自由文件（別人的、固定文件、已經刪了）就是 `false`。
 */
export async function deleteDocument(project: AuthorizedProject, documentId: string): Promise<boolean> {
  const deleted = await getDb()
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(and(eq(documents.id, documentId), inUnit(project), eq(documents.kind, FREE_DOCUMENT)))
    .returning({ id: documents.id });
  return deleted.length > 0;
}

/**
 * 復原剛刪的自由文件（畫面上那個「復原」）。排程清掉之前都救得回來。
 *
 * @returns 不是這個專案已刪除的自由文件就是 `false`。
 */
export async function restoreDocument(project: AuthorizedProject, documentId: string): Promise<boolean> {
  const restored = await getDb()
    .update(documents)
    .set({ deletedAt: null })
    .where(
      and(
        eq(documents.id, documentId),
        inUnitIncludingDeleted(project),
        eq(documents.kind, FREE_DOCUMENT),
        isNotNull(documents.deletedAt),
      ),
    )
    .returning({ id: documents.id });
  return restored.length > 0;
}

/**
 * 每日排程：真的刪掉在 `before` 之前就被刪除的文件。不吃 handle —— 這是一條寫死的政策，不是誰的操作
 * （同訪客 TTL 清理，不變式 I）。
 *
 * @returns 清掉幾份。
 */
export async function purgeDeletedDocuments(before: Date): Promise<number> {
  const purged = await getDb()
    .delete(documents)
    .where(and(isNotNull(documents.deletedAt), lt(documents.deletedAt, before)))
    .returning({ id: documents.id });
  return purged.length;
}

/** 只有空白的名字 ＝ 沒命名。 */
function normalizeTitle(title: string | null): string | null {
  const trimmed = title?.trim();
  return trimmed ? trimmed : null;
}
