import { describe, expect, it } from "vitest";

import { isAllowedEmail, parseAllowlist } from "./allowlist";

/**
 * allowlist 是 **env var 逗號清單，不是 `invitations` 表**（票券 24 §7）。
 * 它是一個看得出來是暫時物的東西 —— 建了表，它就會開始長欄位。
 */
describe("allowlist", () => {
  it("逗號清單會去掉空白與空項目", () => {
    expect(parseAllowlist(" a@example.com , b@example.com ,, ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("大小寫不影響比對 —— Google 回來的 email 與作者打進 env var 的不保證一致", () => {
    expect(isAllowedEmail("Author@Example.com", "author@example.com")).toBe(true);
  });

  it("不在清單上的人進不來", () => {
    expect(isAllowedEmail("stranger@example.com", "author@example.com")).toBe(false);
  });

  it("沒設或設空就是誰都不准進（fail closed）", () => {
    // 少一個環境變數的後果必須是「沒人登得進來」而不是「所有人都登得進來」——
    // 這兩種失敗的代價不對稱。
    expect(isAllowedEmail("author@example.com", undefined)).toBe(false);
    expect(isAllowedEmail("author@example.com", "")).toBe(false);
    expect(isAllowedEmail("author@example.com", " , ")).toBe(false);
  });

  it("沒有 email 的身分不算在清單上", () => {
    expect(isAllowedEmail(null, "author@example.com")).toBe(false);
    expect(isAllowedEmail(undefined, "author@example.com")).toBe(false);
  });
});
