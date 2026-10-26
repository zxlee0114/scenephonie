/**
 * 角色設定表的寫入與讀取（票券 21 第 ② 片，§6.2、ADR-0005）。
 */
import { describe, expect, it } from "vitest";

import { documentFromJSON } from "../documents";
import { entityDirectory, mintCharacterId } from "../entities";
import { addCharacterEntry, characterSheetIds } from "./character-sheet";

const ruoqing = mintCharacterId();
const xiaoming = mintCharacterId();
const directory = entityDirectory({ characterIds: [ruoqing, xiaoming] });

const sheet = (...ids: string[]) =>
  documentFromJSON("角色設定表", {
    type: "doc",
    content: ids.map((characterId) => ({ type: "characterEntry", attrs: { characterId }, content: [{ type: "paragraph" }] })),
  });

describe("addCharacterEntry", () => {
  it("收錄一位既有人物，排在最後", () => {
    const result = addCharacterEntry(sheet(ruoqing), { characterId: xiaoming, directory });
    expect(result.ok && characterSheetIds(result.value.toJSON())).toEqual([ruoqing, xiaoming]);
  });

  it("新收錄的那一位底下是一段空的介紹內文，等著寫", () => {
    const result = addCharacterEntry(sheet(), { characterId: ruoqing, directory });
    expect(result.ok && result.value.child(0).toJSON()).toEqual({
      type: "characterEntry",
      attrs: { characterId: ruoqing },
      content: [{ type: "paragraph" }],
    });
  });

  it("不存在的人物不能收錄 —— 先建立實體、再寫入 doc（不變式 ⑧）", () => {
    const result = addCharacterEntry(sheet(), { characterId: mintCharacterId(), directory });
    expect(result.ok).toBe(false);
  });

  it("同一個人不收兩次 —— 第二筆不會是第二個小明，只是同一筆重複", () => {
    const result = addCharacterEntry(sheet(xiaoming), { characterId: xiaoming, directory });
    expect(result.ok).toBe(false);
  });
});

describe("characterSheetIds：表上收錄了誰（讀取容忍壞形狀）", () => {
  it("依表上的順序", () => {
    expect(characterSheetIds(sheet(xiaoming, ruoqing).toJSON())).toEqual([xiaoming, ruoqing]);
  });

  it("壞掉的節點略過，不讓整份讀不出來", () => {
    expect(
      characterSheetIds({
        type: "doc",
        content: [
          { type: "characterEntry", attrs: { characterId: ruoqing } },
          { type: "characterEntry", attrs: {} },
          { type: "paragraph" },
        ],
      }),
    ).toEqual([ruoqing]);
  });

  it("不是一份 doc 就是空的", () => {
    expect(characterSheetIds(null)).toEqual([]);
    expect(characterSheetIds({ type: "doc" })).toEqual([]);
  });
});
