import { describe, expect, it } from "vitest";

import { projectSceneNumbers } from "./index";

describe("projectSceneNumbers", () => {
  it("多場次 doc 依序推導出 1..N", () => {
    expect(projectSceneNumbers(3)).toEqual([1, 2, 3]);
  });

  it("空 doc 得到空序列", () => {
    expect(projectSceneNumbers(0)).toEqual([]);
  });

  it("拒絕負數與非整數", () => {
    expect(() => projectSceneNumbers(-1)).toThrow(RangeError);
    expect(() => projectSceneNumbers(1.5)).toThrow(RangeError);
  });
});
