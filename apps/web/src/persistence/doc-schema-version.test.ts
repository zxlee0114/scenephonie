import { describe, expect, it } from "vitest";

import {
  CURRENT_DOC_SCHEMA_VERSION,
  FutureDocSchemaVersionError,
  MissingDocMigrationError,
  __installMigrationForTest,
  migrateDocToCurrent,
} from "./doc-schema-version";

describe("doc schema 的 lazy 遷移", () => {
  it("已經是現行版本就原封不動", () => {
    const doc = { type: "doc", content: [] };
    expect(migrateDocToCurrent(doc, CURRENT_DOC_SCHEMA_VERSION)).toBe(doc);
  });

  it("舊版逐節走過遷移鏈，且不改動輸入（遷移是純函式）", () => {
    const restore = __installMigrationForTest(CURRENT_DOC_SCHEMA_VERSION - 1, (doc) => ({
      ...doc,
      migrated: true,
    }));
    try {
      const stored = { type: "doc", content: [] };
      const migrated = migrateDocToCurrent(stored, CURRENT_DOC_SCHEMA_VERSION - 1);

      expect(migrated).toEqual({ type: "doc", content: [], migrated: true });
      expect(stored).toEqual({ type: "doc", content: [] });
    } finally {
      restore();
    }
  });

  it("遷移鏈缺一節就大聲失敗 —— 那是程式碼的 bug，不是資料的問題", () => {
    expect(() => migrateDocToCurrent({}, CURRENT_DOC_SCHEMA_VERSION - 1)).toThrow(
      MissingDocMigrationError,
    );
  });

  it("doc 比程式碼新時拒絕讀 —— 硬讀等於用舊 schema 覆蓋新資料", () => {
    expect(() => migrateDocToCurrent({}, CURRENT_DOC_SCHEMA_VERSION + 1)).toThrow(
      FutureDocSchemaVersionError,
    );
  });
});
