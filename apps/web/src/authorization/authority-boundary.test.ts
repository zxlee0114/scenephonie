import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 不變式 H／I 的可 grep 邊界（[ADR-0011](../../../../docs/adr/0011-authentication-identity-is-not-domain-authority.md)、
 * [ADR-0012](../../../../docs/adr/0012-infrastructure-provides-mechanism-not-authority.md)）。
 *
 * > 任何由 infrastructure、auth library、plugin 或 database provider 提供的 access-control
 * > mechanism，都不得成為 domain/application authorization 的權威來源。
 *
 * ADR-0011 自己說過**靠慣例維持的東西會說謊**，所以這條邊界要能被機械檢查。這個檔案就是
 * 那條 grep —— 它擋的不是技術，是**用途**：可以使用 mechanism，不可以把它當 authority。
 */

const APPS_WEB_SRC = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_SRC = fileURLToPath(new URL("../../../../packages/schema/src", import.meta.url));
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

const THIS_FILE = "authority-boundary.test.ts";

function filesUnder(root: string, extensions: RegExp): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "meta") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

const sourceFiles = (): string[] => [
  ...filesUnder(APPS_WEB_SRC, /\.tsx?$/),
  ...filesUnder(SCHEMA_SRC, /\.tsx?$/),
];

/**
 * 註解不算數 —— 這一組守的是**程式碼在做什麼**，不是文字裡出現過哪些詞。不然這個檔案會
 * 反過來禁止大家在註解裡解釋為什麼不准用那些東西，而那正是這些規則最需要被寫下的地方。
 *
 * 粗糙但夠用：字串字面值裡的 `//` 會被誤傷，本 repo 沒有那種字串。
 */
const codeOf = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");

const offencesIn = (files: string[], pattern: RegExp, allowed: string[]): string[] =>
  files
    .filter((file) => !file.endsWith(THIS_FILE))
    .filter((file) => !allowed.some((allow) => file.includes(allow)))
    .filter((file) => pattern.test(codeOf(file)))
    .map((file) => relative(APPS_WEB_SRC, file));

describe("不變式 I —— infrastructure 提供機制，不提供授權真理", () => {
  it("domain 永不讀 `accounts`（provider identity 留在 auth library 裡）", () => {
    // ADR-0011 §①。`accounts` 只有兩個地方可以認識：表的定義本身，與把表交給 adapter 的
    // 那一行 auth 設定。domain 只認 `users.id`。
    const allowed = [join("db", "schema.ts"), join("auth", "auth.ts")];
    expect(offencesIn(sourceFiles(), /\baccounts\b|"accounts"/, allowed)).toEqual([]);
  });

  it("沒有採用 auth library 的授權判斷（只採用它的資料模型）", () => {
    // ADR-0011 §⑤ 的禁止清單。`organization` plugin 自帶完整 RBAC，官方文件自述
    // 「the plugin enforces all role-based access control checks」—— 那正是不變式 H 明文
    // 否決的形狀。plugin 的存在不改變那個裁決，只是把誘惑放到手邊。
    //
    // `activeOrganizationId` 尤其是 UI 狀態不是權限：拿它當授權依據，使用者換 tab 就換權限。
    const banned = /createAccessControl|hasPermission|organizationRole|activeOrganizationId/;
    expect(offencesIn(sourceFiles(), banned, [])).toEqual([]);
  });

  it("Supabase 只是 PostgreSQL 託管 —— 它的 Auth／RLS 不參與授權", () => {
    // ADR-0012 §③。連線字串指向 Supabase 是正常的（那是託管），但 `@supabase/*` client、
    // RLS policy 或 `auth.uid()` 一出現，就代表授權判斷開始有第二個家。
    const banned = /@supabase\/|createRLSPolicy|ENABLE ROW LEVEL SECURITY|auth\.uid\(\)/;
    expect(offencesIn(sourceFiles(), banned, [])).toEqual([]);
  });

  it("沒有影子表 —— `users.id` 就是 domain 的 UserId", () => {
    // 票券 24 §4／票券 30 §1：blocking criterion 通過，所以 `auth_user ↔ users` 的 1:1
    // 對映不必存在。它一旦出現，「換 library 時 `owner_id` 不動」就要重新論證。
    expect(offencesIn(sourceFiles(), /auth_user|authUser/, [])).toEqual([]);
  });
});

describe("allowlist 是 env var，不是資料表", () => {
  it("repo 內沒有 `invitations` 表", () => {
    // 票券 24 §7：建表等於在 v1 就把 members／invitations 的形狀猜出來，而那要留給未來演進。
    const files = [...sourceFiles(), ...filesUnder(MIGRATIONS, /\.sql$/)];
    expect(offencesIn(files, /invitations/, [])).toEqual([]);
  });
});
