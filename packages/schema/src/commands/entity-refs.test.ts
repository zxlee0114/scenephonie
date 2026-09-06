import { describe, expect, it } from "vitest";

import { entityDirectory, mintCharacterId, mintLocationId, sceneLocations } from "../entities";
import { block, makeDoc, makeScene, sceneWith } from "../testing";
import {
  setAppearingCharacters,
  setDialogueCharacter,
  setSceneIntExt,
  setSceneLocations,
} from "./entity-refs";

const dolphinApartment = mintLocationId();
const policeStation = mintLocationId();
const xiaoming = mintCharacterId();
const xiaohua = mintCharacterId();

const directory = entityDirectory({
  locationIds: [dolphinApartment, policeStation],
  characterIds: [xiaoming, xiaohua],
});

const sceneIdOf = (doc: ReturnType<typeof makeDoc>) => doc.child(0).attrs.sceneId as string;
const unwrap = (result: ReturnType<typeof setSceneLocations>) => {
  if (!result.ok) throw new Error(`command 被拒絕：${result.reason}`);
  return result.value;
};

describe("setSceneLocations（不變式 ⑧ 的寫入那一半）", () => {
  it("命中既有實體 → 寫進去，形狀是 { id, 這一場顯示的名字 }", () => {
    const doc = makeDoc(makeScene());
    const sceneId = sceneIdOf(doc);

    const next = unwrap(
      setSceneLocations(doc, {
        sceneId,
        refs: [{ locationId: dolphinApartment, displayName: "未知大樓房間" }],
        directory,
      }),
    );

    // 單值就存單值（§4.3），顯示名是編劇這一場寫的字，不是實體名。
    expect(next.child(0).attrs.location).toEqual({
      locationId: dolphinApartment,
      displayName: "未知大樓房間",
    });
  });

  it("拒絕對不存在實體的引用，訊息指出「先建立實體、再寫入 doc」", () => {
    const doc = makeDoc(makeScene());
    const result = setSceneLocations(doc, {
      sceneId: sceneIdOf(doc),
      refs: [{ locationId: "lo_不存在", displayName: "海豚公寓房間" }],
      directory,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("先建立實體、再寫入 doc");
  });

  it("空陣列 ＝ 清空，寫回 null（＝尚未填，不是空陣列）", () => {
    const doc = makeDoc(makeScene({ location: { locationId: dolphinApartment, displayName: "房間" } }));
    const next = unwrap(setSceneLocations(doc, { sceneId: sceneIdOf(doc), refs: [], directory }));

    expect(next.child(0).attrs.location).toBeNull();
  });

  it("雜景才可多值；其餘場次的第二個地點由 command 自己拒絕", () => {
    const refs = [
      { locationId: dolphinApartment, displayName: "海豚公寓房間" },
      { locationId: policeStation, displayName: "派出所" },
    ];

    const plainScene = makeDoc(makeScene({ intExt: "內景" }));
    expect(setSceneLocations(plainScene, { sceneId: sceneIdOf(plainScene), refs, directory }).ok).toBe(false);

    const montageScene = makeDoc(makeScene({ intExt: "雜景" }));
    const next = unwrap(setSceneLocations(montageScene, { sceneId: sceneIdOf(montageScene), refs, directory }));
    expect(sceneLocations(next.child(0).attrs.location)).toHaveLength(2);
  });

  it("同一個實體在同一場出現兩次 → 拒絕", () => {
    const doc = makeDoc(makeScene({ intExt: "雜景" }));
    const result = setSceneLocations(doc, {
      sceneId: sceneIdOf(doc),
      refs: [
        { locationId: dolphinApartment, displayName: "房間" },
        { locationId: dolphinApartment, displayName: "海豚公寓房間" },
      ],
      directory,
    });
    expect(result.ok).toBe(false);
  });

  it("不動場次身分（不變式 ⑦）", () => {
    const doc = makeDoc(makeScene(), makeScene());
    const before = [doc.child(0).attrs.sceneId, doc.child(1).attrs.sceneId];

    const next = unwrap(
      setSceneLocations(doc, {
        sceneId: sceneIdOf(doc),
        refs: [{ locationId: policeStation, displayName: "派出所" }],
        directory,
      }),
    );

    expect([next.child(0).attrs.sceneId, next.child(1).attrs.sceneId]).toEqual(before);
  });
});

describe("setSceneIntExt：單值規則的另一半", () => {
  const montageWithTwoLocations = () => {
    const doc = makeDoc(makeScene({ intExt: "雜景" }));
    const sceneId = sceneIdOf(doc);
    return unwrap(
      setSceneLocations(doc, {
        sceneId,
        refs: [
          { locationId: dolphinApartment, displayName: "海豚公寓房間" },
          { locationId: policeStation, displayName: "派出所" },
        ],
        directory,
      }),
    );
  };

  it("離開雜景時若地點欄還是多值 → 拒絕（不在編劇背後丟掉他打的地點）", () => {
    const doc = montageWithTwoLocations();
    const result = setSceneIntExt(doc, { sceneId: sceneIdOf(doc), intExt: "內景" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("先拿掉多餘的地點");
  });

  it("先把多餘的地點拿掉，就改得回去", () => {
    const doc = montageWithTwoLocations();
    const sceneId = sceneIdOf(doc);
    const trimmed = unwrap(
      setSceneLocations(doc, {
        sceneId,
        refs: [{ locationId: dolphinApartment, displayName: "海豚公寓房間" }],
        directory,
      }),
    );

    const result = setSceneIntExt(trimmed, { sceneId, intExt: "內景" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.child(0).attrs.intExt).toBe("內景");
  });

  it("留在雜景照常改得動", () => {
    const doc = montageWithTwoLocations();
    expect(setSceneIntExt(doc, { sceneId: sceneIdOf(doc), intExt: "雜景" }).ok).toBe(true);
  });
});

describe("setAppearingCharacters", () => {
  it("寫入多個人物引用，各自帶這一場的顯示名", () => {
    const doc = makeDoc(makeScene());
    const next = unwrap(
      setAppearingCharacters(doc, {
        sceneId: sceneIdOf(doc),
        refs: [
          { characterId: xiaoming, displayName: "男子" },
          { characterId: xiaohua, displayName: "小華" },
        ],
        directory,
      }),
    );

    expect(next.child(0).attrs.appearingCharacters).toEqual([
      { characterId: xiaoming, displayName: "男子" },
      { characterId: xiaohua, displayName: "小華" },
    ]);
  });

  it("拒絕不存在的人物", () => {
    const doc = makeDoc(makeScene());
    const result = setAppearingCharacters(doc, {
      sceneId: sceneIdOf(doc),
      refs: [{ characterId: "ch_不存在", displayName: "小明" }],
      directory,
    });
    expect(result.ok).toBe(false);
  });
});

describe("setDialogueCharacter", () => {
  it("命中人物 → 寫進對白的人物欄", () => {
    const doc = makeDoc(sceneWith([block.dialogue("我回來了")]));
    const next = unwrap(
      setDialogueCharacter(doc, {
        sceneId: sceneIdOf(doc),
        blockIndex: 0,
        ref: { id: xiaoming, displayName: "男子" },
        directory,
      }),
    );

    expect(next.child(0).child(0).attrs.character).toEqual({ id: xiaoming, displayName: "男子" });
  });

  it("本場次的群演也是合法目標（場次限定實體，問的是這一場的 extras）", () => {
    const doc = makeDoc(
      sceneWith([block.dialogue("兩碗麵")], {
        extras: [{ extraId: "ex_1", description: "咖啡廳客人", count: 8 }],
      }),
    );

    const next = unwrap(
      setDialogueCharacter(doc, {
        sceneId: sceneIdOf(doc),
        blockIndex: 0,
        ref: { id: "ex_1", displayName: "客人" },
        directory,
      }),
    );
    expect(next.child(0).child(0).attrs.character).toEqual({ id: "ex_1", displayName: "客人" });
  });

  it("別場的群演不是這一場的合法目標", () => {
    const doc = makeDoc(
      sceneWith([block.dialogue("兩碗麵")], { extras: [] }),
      sceneWith([block.action("別場")], {
        extras: [{ extraId: "ex_1", description: "咖啡廳客人", count: 8 }],
      }),
    );

    const result = setDialogueCharacter(doc, {
      sceneId: sceneIdOf(doc),
      blockIndex: 0,
      ref: { id: "ex_1", displayName: "客人" },
      directory,
    });
    expect(result.ok).toBe(false);
  });

  it("null ＝ 清掉說話者", () => {
    const doc = makeDoc(
      sceneWith([block.dialogue("我回來了", { character: { id: xiaoming, displayName: "小明" } })]),
    );
    const next = unwrap(
      setDialogueCharacter(doc, { sceneId: sceneIdOf(doc), blockIndex: 0, ref: null, directory }),
    );
    expect(next.child(0).child(0).attrs.character).toBeNull();
  });

  it("只有對白有人物欄", () => {
    const doc = makeDoc(sceneWith([block.action("走進房間")]));
    const result = setDialogueCharacter(doc, {
      sceneId: sceneIdOf(doc),
      blockIndex: 0,
      ref: { id: xiaoming, displayName: "小明" },
      directory,
    });
    expect(result.ok).toBe(false);
  });
});
