import type { DocumentKind } from "@scenephonie/schema";

import type { PersistedDoc } from "./doc-schema-version";

/**
 * 劇本外文件的 schema 版本與 lazy 遷移（票券 21，§6.2）。
 *
 * 與劇本那一份（`doc-schema-version.ts`）同一套規則 —— 隨程式碼走、部署時變、遷移永遠在記憶體、
 * 讀取路徑不寫回 —— 只差一件事：**每個 kind 有自己的版本號與自己的遷移鏈**。`documents` 那一列的
 * `doc_schema_version` 是**該 kind 的版本**，不是全域數字：交件大綱改了 schema，分場大綱一個字都
 * 不動，它的鏈也不會被拿來走。
 *
 * 「什麼改動要 +1」的判準同劇本那一份檔頭那張表：管的是**讀不讀得出來**，不是值的意思。
 */

/** 每個 kind 的現行 node schema 版本。改了那個 kind 的 schema 且舊 doc 讀不出來時，那一格 +1、補一節遷移。 */
export const CURRENT_DOCUMENT_SCHEMA_VERSIONS: Record<DocumentKind, number> = {
  交件大綱: 1,
  分場大綱: 1,
  自由文件: 1,
};

type DocumentMigration = (doc: PersistedDoc) => PersistedDoc;

/** `migrations[kind].get(n)` 把該 kind 的版本 `n` 帶到 `n + 1`。v1 每條鏈都是空的 —— 它們是遷移路徑的家。 */
const migrations: Record<DocumentKind, Map<number, DocumentMigration>> = {
  交件大綱: new Map(),
  分場大綱: new Map(),
  自由文件: new Map(),
};

/** 文件的版本比這份程式碼還新（rolling deploy 期間的舊 instance 讀到新 doc）。 */
export class FutureDocumentSchemaVersionError extends Error {
  constructor(
    readonly kind: DocumentKind,
    readonly docVersion: number,
  ) {
    super(`${kind}的 schema 版本（${docVersion}）比這份程式碼（${CURRENT_DOCUMENT_SCHEMA_VERSIONS[kind]}）新`);
    this.name = "FutureDocumentSchemaVersionError";
  }
}

/** 某個 kind 的遷移鏈缺了一節 —— 程式碼的 bug，不是資料的問題。 */
export class MissingDocumentMigrationError extends Error {
  constructor(
    readonly kind: DocumentKind,
    readonly fromVersion: number,
  ) {
    super(`${kind}的遷移鏈缺少 ${fromVersion} → ${fromVersion + 1} 這一節`);
    this.name = "MissingDocumentMigrationError";
  }
}

/** 把一份文件在**記憶體中**沿它自己那個 kind 的鏈帶到現行版本。比現行新就大聲失敗，不猜。 */
export function migrateDocumentToCurrent(kind: DocumentKind, doc: PersistedDoc, fromVersion: number): PersistedDoc {
  const current = CURRENT_DOCUMENT_SCHEMA_VERSIONS[kind];
  if (fromVersion > current) throw new FutureDocumentSchemaVersionError(kind, fromVersion);

  let migrated = doc;
  for (let version = fromVersion; version < current; version += 1) {
    const step = migrations[kind].get(version);
    if (!step) throw new MissingDocumentMigrationError(kind, version);
    migrated = step(migrated);
  }
  return migrated;
}

/** 測試用：暫時替某個 kind 裝一節遷移，回傳還原函式。 */
export function __installDocumentMigrationForTest(
  kind: DocumentKind,
  fromVersion: number,
  step: DocumentMigration,
): () => void {
  const chain = migrations[kind];
  const previous = chain.get(fromVersion);
  chain.set(fromVersion, step);
  return () => {
    if (previous) chain.set(fromVersion, previous);
    else chain.delete(fromVersion);
  };
}
