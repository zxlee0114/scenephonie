import { describe, expect, it } from "vitest";

import { decodeSaveToken, encodeSaveToken } from "./save-token";

describe("存檔 token", () => {
  it("編碼後解得回同一個並行控制值", () => {
    for (const docSeq of [0, 1, 42, 1_000_000]) {
      expect(decodeSaveToken(encodeSaveToken(docSeq))).toBe(docSeq);
    }
  });

  it("token 不是那個數字本身 —— 呼叫端沒有可解讀的東西", () => {
    expect(encodeSaveToken(7)).not.toBe("7");
    expect(encodeSaveToken(7)).not.toContain("seq");
  });

  it("捏造或竄改的 token 解不開（回 null，由呼叫端當成 conflict 處理）", () => {
    expect(decodeSaveToken("7")).toBeNull();
    expect(decodeSaveToken("")).toBeNull();
    expect(decodeSaveToken("st_")).toBeNull();
    expect(decodeSaveToken("st_-1")).toBeNull();
    expect(decodeSaveToken("st_ZZ")).toBeNull();
  });
});
