import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 「呼叫端只知道存／載」是一條可 grep 驗證的規則，不是一句好意（§6.7）。
 *
 * 備份、`doc_seq`、schema 遷移是 persistence 守住承諾的內部手段。任何一個詞漏到模組外，
 * 就代表那個概念開始有第二個知情者 —— 而那正是「整份 doc 覆蓋」這種假設散進各處的方式。
 */
const REPO_SRC_ROOTS = [
  fileURLToPath(new URL(".", import.meta.url)).replace(`${sep}persistence${sep}`, sep),
  fileURLToPath(new URL("../../../../packages/schema/src", import.meta.url)),
];

/** 只有這兩處可以認識這些詞：模組本身，與資料表定義（schema 就住在那裡）。 */
const ALLOWED = [join("persistence", ""), join("db", "schema.ts")];

const FORBIDDEN = [
  { pattern: /doc_seq|docSeq/, why: "`doc_seq` 是 persistence 的內部並行 token（§6.7）" },
  { pattern: /screenplay_backups|screenplayBackups/, why: "備份是 persistence 的內部機制，無 UI" },
  { pattern: /doc_schema_version|docSchemaVersion/, why: "schema 版本與遷移住在 persistence 裡" },
];

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

describe("persistence 的模組邊界", () => {
  it("模組外的程式碼看不到備份、doc_seq 與 schema 版本", () => {
    const offences: string[] = [];

    for (const root of REPO_SRC_ROOTS) {
      for (const file of sourceFiles(root)) {
        if (ALLOWED.some((allowed) => file.includes(allowed))) continue;
        const contents = readFileSync(file, "utf8");
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(contents)) {
            offences.push(`${relative(root, file)}：${why}`);
          }
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
