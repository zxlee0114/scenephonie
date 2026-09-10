import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 「刪除實體」這個動作不存在（[ADR-0005](../../../../docs/adr/0005-entities-exist-by-reference.md)）——
 * 寫成一條 grep。
 *
 * 存在＝被引用：編劇能做的只有拿掉引用，最後一個引用被拿掉時實體自動變孤兒。孤兒不出現在
 * 任何地方、**v1 永不清理**，因為它不佔任何人的視野。
 *
 * 這條為什麼需要機械檢查：日後一定會有人看到 `characters` 表裡的孤兒，覺得那是垃圾資料而想
 * 寫一支清理任務或一個「刪除人物」按鈕。那不是打掃，是**在編劇的 ⌘Z 底下抽掉資料** ——
 * doc 與實體表沒有共同的 undo 堆疊，能刪就會刪到還被引用的東西。靠註解攔不住，靠測試可以。
 */

const ENTITIES_SRC = fileURLToPath(new URL(".", import.meta.url));

/**
 * 只看**產品程式碼**：測試檔自己會 `delete` 掉造出來的 `users` 來清場，那是測試的家務事，
 * 不是產品裡的一條刪除路徑。
 */
function filesUnder(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** 註解不算數 —— 守的是程式碼在做什麼，不是文字裡出現過哪些詞。 */
const codeOf = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("實體表是 append-only：沒有刪除路徑", () => {
  const files = filesUnder(ENTITIES_SRC);

  it("entities 模組裡沒有任何一支對 characters／locations 的 delete", () => {
    const offences = files
      .filter((file) => /\.delete\s*\(/.test(codeOf(file)))
      .map((file) => relative(ENTITIES_SRC, file));

    expect(offences).toEqual([]);
  });

  it("模組對外也不曝露任何 delete／remove 名稱的東西", async () => {
    const api = await import("./index");
    expect(Object.keys(api).filter((name) => /delete|remove|purge|cleanup/i.test(name))).toEqual([]);
  });
});
