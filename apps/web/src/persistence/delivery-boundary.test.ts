import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { deliveries } from "@/db/schema";

/**
 * 交付的三條線（票券 17，§10.4、§6.2），寫成可 grep／可反射的規則 —— 靠慣例維持的東西會說謊。
 *
 * 1. **不被遷移**：`deliveries` 沒有 `doc_seq`／`doc_schema_version`。唯一沾邊的是 `source_doc_seq` ——
 *    建立時拍下「承諾的是哪一個 canonical state」的來源記錄（票券 20，使用者裁決 2026-10-23），
 *    不是並行 token：沒有任何一支 `update(deliveries)` 會動它（第 3 條）。
 * 2. **與備份不共用寫入機制**：交付的寫入路徑不碰 `screenplay_backups`，存檔路徑不碰 `deliveries`。
 * 3. **唯一刻意不可變**：整個產品程式碼裡沒有一支 `update(deliveries)`／`delete(deliveries)`。
 */
const SRC = fileURLToPath(new URL("..", import.meta.url));
const PERSISTENCE = fileURLToPath(new URL(".", import.meta.url));

/** 只看產品程式碼：測試檔自己會清場。 */
function productFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) found.push(...productFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** 註解不算數 —— 守的是程式碼在做什麼。 */
const codeOf = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("交付的邊界", () => {
  it("deliveries 沒有 doc_seq／doc_schema_version —— 不被載入編輯、不被遷移（只有來源記錄 source_doc_seq）", () => {
    const columns = getTableConfig(deliveries).columns.map((c) => c.name).sort();
    expect(columns).toEqual(["created_at", "id", "payload", "screenplay_id", "source_doc_seq"]);
  });

  it("交付與備份不共用寫入路徑", () => {
    expect(codeOf(join(PERSISTENCE, "delivery-store.ts"))).not.toMatch(/screenplayBackups/);
    expect(codeOf(join(PERSISTENCE, "screenplay-store.ts"))).not.toMatch(/\bdeliveries\b/);
  });

  it("沒有任何產品程式碼改寫或刪除一筆交付", () => {
    const offences = productFiles(SRC)
      .filter((file) => /\.(update|delete)\s*\(\s*deliveries\b/.test(codeOf(file)))
      .map((file) => relative(SRC, file));
    expect(offences).toEqual([]);
  });
});
