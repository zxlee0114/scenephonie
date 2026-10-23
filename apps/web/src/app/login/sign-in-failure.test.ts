import { describe, expect, it } from "vitest";

import { signInFailure } from "./sign-in-failure";

describe("登入頁讀 `?error=` 決定說什麼", () => {
  it("沒有 error 就什麼都不說", () => {
    expect(signInFailure(undefined)).toBeNull();
  });

  it("allowlist 擋下的才說「不在受邀清單上」", () => {
    expect(signInFailure("not_invited")).toBe("uninvited");
  });

  it("說不出原因的錯誤碼一律是通用訊息，不硬猜", () => {
    expect(signInFailure("state_mismatch")).toBe("generic");
    expect(signInFailure("access_denied")).toBe("generic");
  });

  it("網址裡有好幾個 error 也不會拋錯，其中有 allowlist 的就照它說", () => {
    expect(signInFailure(["not-allowed", "not_invited"])).toBe("uninvited");
    expect(signInFailure(["a", "b"])).toBe("generic");
  });

  it("空字串不算錯誤", () => {
    expect(signInFailure("")).toBeNull();
    expect(signInFailure([])).toBeNull();
  });
});
