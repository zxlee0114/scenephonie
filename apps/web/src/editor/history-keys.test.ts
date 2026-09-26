/**
 * 一個框**自己的**原生歷史（票券 54 驗收回饋）。
 *
 * Chrome／Safari 的原生 undo 堆疊是整份頁面共用一條，不是每個框各一份 —— 框自己的編輯退光
 * 之後再按，退的是**別的框**上一刻的編輯，焦點還跟著跳過去（人工驗收撈到的 `小明小明`）。
 * 這裡量的是那本帳：什麼時候那一下還停得在這個框裡。
 */
import { describe, expect, it } from "vitest";

import { ownHistory } from "./history-keys";

const typing = { inputType: "insertText" } as InputEvent;
const undone = { inputType: "historyUndo" } as InputEvent;
const redone = { inputType: "historyRedo" } as InputEvent;

describe("ownHistory", () => {
  it("剛開始算、還沒動過 —— undo／redo 都不放行（堆疊頂端是別人的）", () => {
    const box = ownHistory();
    box.start("路人");
    expect(box.allows("undo", "路人")).toBe(false);
    expect(box.allows("redo", "路人")).toBe(false);
  });

  it("動過之後放行 undo，退回起點就停", () => {
    const box = ownHistory();
    box.start("路人");
    box.typed(typing);
    expect(box.allows("undo", "")).toBe(true);
    box.typed(undone); // 原生 undo 自己造成的那一次 input 不算編劇的編輯
    expect(box.allows("undo", "路人")).toBe(false);
  });

  it("redo 只做回剛剛放行過的那幾步", () => {
    const box = ownHistory();
    box.start("路人");
    box.typed(typing);
    expect(box.allows("undo", "")).toBe(true);
    box.typed(undone);
    expect(box.allows("redo", "路人")).toBe(true);
    box.typed(redone);
    expect(box.allows("redo", "")).toBe(false);
    // 做回來之後又離開起點了 —— undo 照樣放行。
    expect(box.allows("undo", "")).toBe(true);
  });

  it("撤銷之後又打字 ＝ redo 那一串作廢（同原生堆疊的規則）", () => {
    const box = ownHistory();
    box.start("");
    box.typed(typing);
    expect(box.allows("undo", "3")).toBe(true);
    box.typed(undone);
    box.typed(typing);
    expect(box.allows("redo", "5")).toBe(false);
  });

  it("重新開始算 ＝ 之前那本帳整本作廢（換到別的框、再拿起一筆）", () => {
    const box = ownHistory();
    box.start("路人");
    box.typed(typing);
    expect(box.allows("undo", "")).toBe(true);
    box.start("路人");
    expect(box.allows("undo", "路人甲")).toBe(false);
    expect(box.allows("redo", "路人甲")).toBe(false);
  });
});
