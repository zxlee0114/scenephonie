/**
 * doc schema 版本與 lazy 遷移（§6.7）。
 *
 * `doc_schema_version` 隨**程式碼**走 —— 我們改了 node schema 才變，部署時變。
 * （另一個欄位 `doc_seq` 隨**資料**走，見 `save-token.ts`。）
 *
 * **遷移永遠在記憶體發生。** 這個模組只有純函式，碰不到資料庫；寫回由 `screenplay-store.ts`
 * 決定，且只發生在本來就會寫的路徑（使用者存檔、伺服器端 command）。讀取路徑一律不寫回 ——
 * 否則 PDF 匯出／場次表／分享連結都會觸發資料庫寫入，且會製造兩個 client 同時載入舊 schema
 * 互相覆蓋的 race。代價是「只被讀從不被編輯」的 doc 永遠停在舊版，但遷移鏈無論如何都得留著。
 */

/** 持久化的 canonical document —— ProseMirror JSON。 */
export type PersistedDoc = Record<string, unknown>;

/**
 * 現行 node schema 版本。
 *
 * 改 `packages/schema` 的 node schema 且舊 doc 無法原封不動被新 schema 讀出時，
 * 這個數字 +1，並在 `migrations` 補上那一節。
 */
export const CURRENT_DOC_SCHEMA_VERSION = 1;

/** 把版本 `n` 的 doc 變成版本 `n + 1` 的 doc。純函式，不得有副作用。 */
type DocMigration = (doc: PersistedDoc) => PersistedDoc;

/**
 * 遷移鏈：`migrations[n]` 把版本 `n` 帶到 `n + 1`。
 *
 * v1 是第一版，鏈是空的。**空鏈不是「還沒需要」的佔位** —— 它是遷移路徑的家，
 * 有了它，第一次改 schema 的人不必先發明一套機制。
 */
const migrations = new Map<number, DocMigration>();

/** doc 的版本比這份程式碼還新（rolling deploy 期間的舊 instance 讀到新 doc）。 */
export class FutureDocSchemaVersionError extends Error {
  constructor(readonly docVersion: number) {
    super(`doc 的 schema 版本（${docVersion}）比這份程式碼（${CURRENT_DOC_SCHEMA_VERSION}）新`);
    this.name = "FutureDocSchemaVersionError";
  }
}

/** 遷移鏈缺了一節 —— 程式碼的 bug，不是資料的問題。 */
export class MissingDocMigrationError extends Error {
  constructor(readonly fromVersion: number) {
    super(`遷移鏈缺少 ${fromVersion} → ${fromVersion + 1} 這一節`);
    this.name = "MissingDocMigrationError";
  }
}

/**
 * 把一份任意版本的 doc 在**記憶體中**帶到現行版本。
 *
 * 比現行版本新時大聲失敗而不是猜 —— 舊程式碼看不懂新 doc，硬讀等於用舊 schema
 * 覆蓋掉新資料。
 */
export function migrateDocToCurrent(doc: PersistedDoc, fromVersion: number): PersistedDoc {
  if (fromVersion > CURRENT_DOC_SCHEMA_VERSION) {
    throw new FutureDocSchemaVersionError(fromVersion);
  }

  let migrated = doc;
  for (let version = fromVersion; version < CURRENT_DOC_SCHEMA_VERSION; version += 1) {
    const step = migrations.get(version);
    if (!step) throw new MissingDocMigrationError(version);
    migrated = step(migrated);
  }
  return migrated;
}

/** 測試用：暫時裝一節遷移，回傳還原函式。正式遷移直接寫進上面的 `migrations`。 */
export function __installMigrationForTest(fromVersion: number, step: DocMigration): () => void {
  const previous = migrations.get(fromVersion);
  migrations.set(fromVersion, step);
  return () => {
    if (previous) migrations.set(fromVersion, previous);
    else migrations.delete(fromVersion);
  };
}
