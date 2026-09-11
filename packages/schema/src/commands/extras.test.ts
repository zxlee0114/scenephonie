/**
 * 群演欄的寫入（票券 09）。**這裡沒有 `EntityDirectory`** —— 群演是場次限定實體，
 * 存在性由它所在的場次自明（見 `extras.ts` 檔頭）。
 */
import { describe, expect, it } from "vitest";

import { mintExtraId, sceneExtras } from "../extras";
import { entityDirectory, mintCharacterId } from "../entities";
import { block, makeDoc, makeScene, sceneWith } from "../testing";
import { setDialogueCharacters } from "./entity-refs";
import { addSceneExtras, setSceneExtras, takeOneFromExtra } from "./extras";

/**
 * 讀回來的一筆。`countValue` 是人數的新形態（票券 44 的遷移窗口）—— 這裡的資料都只有舊
 * 的數字，於是新形態一律是「確切 N」。命令那一層還沒搬（票券 46），這個 helper 只是讓
 * 下面幾條期望值不必為了多一個欄位而重寫一遍。
 */
const read = (extraId: string, description: string, count: number) => ({
  extraId,
  description,
  count,
  countValue: { kind: "exact", count },
});

const guests = mintExtraId();
const waiters = mintExtraId();

const sceneIdOf = (doc: ReturnType<typeof makeDoc>) => doc.child(0).attrs.sceneId as string;
const unwrap = (result: ReturnType<typeof setSceneExtras>) => {
  if (!result.ok) throw new Error(`command 被拒絕：${result.reason}`);
  return result.value;
};

describe("setSceneExtras", () => {
  it("一場可以有多組「描述 x 人數」", () => {
    const doc = makeDoc(makeScene());
    const next = unwrap(
      setSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [
          { extraId: guests, description: "咖啡廳客人", count: 8 },
          { extraId: waiters, description: "服務生", count: 2 },
        ],
      }),
    );

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([
      read(guests, "咖啡廳客人", 8),
      read(waiters, "服務生", 2),
    ]);
  });

  it("清空寫回空陣列（不是 null）—— 群演沒有「未填」這個狀態", () => {
    const doc = makeDoc(makeScene({ extras: [{ extraId: guests, description: "客人", count: 8 }] }));
    const next = unwrap(setSceneExtras(doc, { sceneId: sceneIdOf(doc), extras: [] }));

    expect(next.child(0).attrs.extras).toEqual([]);
  });

  it("人數必須是正整數", () => {
    const doc = makeDoc(makeScene());
    for (const count of [0, -3, 2.5, Number.NaN]) {
      const result = setSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [{ extraId: guests, description: "客人", count }],
      });
      expect(result.ok).toBe(false);
    }
  });

  it("描述空白、id 形狀不對、同一場重複的 id 都拒絕", () => {
    const doc = makeDoc(makeScene());
    const sceneId = sceneIdOf(doc);

    expect(
      setSceneExtras(doc, { sceneId, extras: [{ extraId: guests, description: "  ", count: 3 }] }).ok,
    ).toBe(false);
    expect(
      setSceneExtras(doc, { sceneId, extras: [{ extraId: "ch_1", description: "客人", count: 3 }] })
        .ok,
    ).toBe(false);
    expect(
      setSceneExtras(doc, {
        sceneId,
        extras: [
          { extraId: guests, description: "客人", count: 3 },
          { extraId: guests, description: "服務生", count: 1 },
        ],
      }).ok,
    ).toBe(false);
  });

  it("找不到場次就拒絕", () => {
    const doc = makeDoc(makeScene());
    expect(setSceneExtras(doc, { sceneId: "sc_不存在", extras: [] }).ok).toBe(false);
  });
});

describe("addSceneExtras", () => {
  it("接在既有的後面，原本那幾筆原封不動", () => {
    const doc = makeDoc(
      makeScene({ extras: [{ extraId: guests, description: "咖啡廳客人", count: 8 }] }),
    );
    const next = unwrap(
      addSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [{ extraId: waiters, description: "服務生", count: 2 }],
      }),
    );

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([
      read(guests, "咖啡廳客人", 8),
      read(waiters, "服務生", 2),
    ]);
  });

  it("值的把關與 setSceneExtras 是同一套（同一場重複的 id 進不來）", () => {
    const doc = makeDoc(
      makeScene({ extras: [{ extraId: guests, description: "咖啡廳客人", count: 8 }] }),
    );
    expect(
      addSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [{ extraId: guests, description: "客人", count: 1 }],
      }).ok,
    ).toBe(false);
    expect(addSceneExtras(doc, { sceneId: "sc_不存在", extras: [] }).ok).toBe(false);
  });
});

describe("takeOneFromExtra —— 升格的群演那一半（票券 35）", () => {
  it("那批人少一個", () => {
    const doc = makeDoc(
      makeScene({
        extras: [
          { extraId: guests, description: "咖啡廳客人", count: 8 },
          { extraId: waiters, description: "服務生", count: 2 },
        ],
      }),
    );
    const next = unwrap(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }));

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([
      read(guests, "咖啡廳客人", 8),
      read(waiters, "服務生", 1),
    ]);
  });

  it("最後一個被拉走 → **整筆消失**，不是留 0 人", () => {
    const doc = makeDoc(
      makeScene({
        extras: [
          { extraId: guests, description: "咖啡廳客人", count: 8 },
          { extraId: waiters, description: "服務生", count: 1 },
        ],
      }),
    );
    const next = unwrap(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }));

    // `x0` 不算人數（票券 09 已裁決）—— 0 個群演等於沒有這一筆。
    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([read(guests, "咖啡廳客人", 8)]);
  });

  it("別場的群演拉不走 —— 群演是場次限定實體", () => {
    const here = sceneWith([block.dialogue("歡迎光臨")], {
      extras: [{ extraId: guests, description: "咖啡廳客人", count: 8 }],
    });
    const elsewhere = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: waiters, description: "服務生", count: 2 }],
    });
    const doc = makeDoc(here, elsewhere);

    const result = takeOneFromExtra(doc, { sceneId: here.attrs.sceneId as string, extraId: waiters });

    expect(result.ok).toBe(false);
    expect(sceneExtras(doc.child(1).attrs.extras)).toHaveLength(1); // 別場那一筆一個字都沒動
  });

  it("找不到場次、找不到那筆群演都拒絕", () => {
    const doc = makeDoc(makeScene({ extras: [{ extraId: guests, description: "客人", count: 8 }] }));

    expect(takeOneFromExtra(doc, { sceneId: "sc_不存在", extraId: guests }).ok).toBe(false);
    expect(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }).ok).toBe(false);
  });
});

describe("對白的人物欄：合法目標是人物或**本場次的**群演（§5.1）", () => {
  const xiaoming = mintCharacterId();
  const directory = entityDirectory({ characterIds: [xiaoming] });

  it("指向本場群演 → 放行；指向別場的群演 → 拒絕（id 只在該場次內有意義）", () => {
    const here = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: guests, description: "咖啡廳客人", count: 8 }],
    });
    const elsewhere = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: waiters, description: "服務生", count: 2 }],
    });
    const doc = makeDoc(here, elsewhere);

    const okResult = setDialogueCharacters(doc, {
      sceneId: here.attrs.sceneId as string,
      blockIndex: 0,
      refs: [{ id: guests, displayName: "眾人" }],
      directory,
    });
    expect(okResult.ok).toBe(true);

    const crossScene = setDialogueCharacters(doc, {
      sceneId: here.attrs.sceneId as string,
      blockIndex: 0,
      refs: [{ id: waiters, displayName: "眾人" }],
      directory,
    });
    expect(crossScene.ok).toBe(false);
  });

  it("拿掉那一筆群演不回頭改對白 —— 懸空引用是合法的讀取狀態（§6.6）", () => {
    const scene = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: guests, description: "咖啡廳客人", count: 8 }],
    });
    const sceneId = scene.attrs.sceneId as string;
    const withSpeaker = unwrapAny(
      setDialogueCharacters(makeDoc(scene), {
        sceneId,
        blockIndex: 0,
        refs: [{ id: guests, displayName: "眾人" }],
        directory,
      }),
    );

    const next = unwrap(setSceneExtras(withSpeaker, { sceneId, extras: [] }));

    expect(next.child(0).attrs.extras).toEqual([]);
    // 台詞與顯示名都還在，只是少一條可聚合的連結。
    expect(next.child(0).child(0).attrs.character).toEqual({ id: guests, displayName: "眾人" });
    expect(next.child(0).child(0).textContent).toBe("喔——");
  });
});

function unwrapAny(result: ReturnType<typeof setDialogueCharacters>) {
  if (!result.ok) throw new Error(`command 被拒絕：${result.reason}`);
  return result.value;
}
