/**
 * 群演欄的寫入（票券 09）。**這裡沒有 `EntityDirectory`** —— 群演是場次限定實體，
 * 存在性由它所在的場次自明（見 `extras.ts` 檔頭）。
 */
import { describe, expect, it } from "vitest";

import type { CountValue } from "../count";
import { mintExtraId, sceneExtras } from "../extras";
import { entityDirectory, mintCharacterId } from "../entities";
import { block, makeDoc, makeScene, sceneWith } from "../testing";
import { setDialogueCharacters } from "./entity-refs";
import { addSceneExtras, setSceneExtras, takeOneFromExtra } from "./extras";

/** 讀回來的一筆 —— 人數只有 `countValue` 那一個形態了（票券 50）。 */
const read = (extraId: string, description: string, countValue: CountValue) => ({
  extraId,
  description,
  countValue,
});

/** 四種樣子，寫短一點 —— 下面幾條表格式的期望值靠它們才讀得出在比什麼。 */
const exact = (count: number): CountValue => ({ kind: "exact", count });
const range = (from: number, to: number): CountValue => ({ kind: "range", from, to });
const atLeast = (count: number): CountValue => ({ kind: "atLeast", count });
const some: CountValue = { kind: "some" };

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
          { extraId: guests, description: "咖啡廳客人", countValue: exact(8) },
          { extraId: waiters, description: "服務生", countValue: exact(2) },
        ],
      }),
    );

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([
      read(guests, "咖啡廳客人", exact(8)),
      read(waiters, "服務生", exact(2)),
    ]);
  });

  it("清空寫回空陣列（不是 null）—— 群演沒有「未填」這個狀態", () => {
    const doc = makeDoc(makeScene({ extras: [{ extraId: guests, description: "客人", countValue: exact(8) }] }));
    const next = unwrap(setSceneExtras(doc, { sceneId: sceneIdOf(doc), extras: [] }));

    expect(next.child(0).attrs.extras).toEqual([]);
  });

  it("四種樣子都收得下，舊欄位由新形態推出來", () => {
    const doc = makeDoc(makeScene());
    const shapes: CountValue[] = [exact(8), range(3, 5), atLeast(10), some];

    for (const countValue of shapes) {
      const next = unwrap(
        setSceneExtras(doc, {
          sceneId: sceneIdOf(doc),
          // `count` 故意給一個對不上的數字：新形態才是權威，寫入端把它蓋掉（票券 46）。
          extras: [{ extraId: guests, description: "客人", countValue }],
        }),
      );
      expect(sceneExtras(next.child(0).attrs.extras)).toEqual([read(guests, "客人", countValue)]);
    }
  });

  it("拒收的是**壞形狀**，不是「非正整數」", () => {
    const doc = makeDoc(makeScene());
    const broken = [
      { kind: "exact", countValue: exact(0) },
      { kind: "exact", count: 2.5 },
      { kind: "range", from: 5, to: 3 },
      { kind: "atLeast", count: Number.NaN },
      { kind: "手寫", countValue: exact(3) },
      "8",
    ];

    for (const countValue of broken) {
      const result = setSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [
          { extraId: guests, description: "客人", countValue: countValue as CountValue },
        ],
      });
      expect(result.ok).toBe(false);
    }
  });

  it("⚠️ 寫入端**不學讀取路徑的裸數字容錯** —— 一個光禿禿的 8 進不來", () => {
    // `sceneExtras` 的 `readCount` 讀得動它（複製貼上、匯入、fixture 繞得過寫入端）；
    // 這裡手上那一筆還沒落地，一個不是四種樣子的人數是呼叫端的 bug，不該被靜靜補起來。
    const doc = makeDoc(makeScene());
    for (const bare of [8, 0, "8"]) {
      expect(
        setSceneExtras(doc, {
          sceneId: sceneIdOf(doc),
          extras: [
            { extraId: guests, description: "客人", countValue: bare as unknown as CountValue },
          ],
        }).ok,
      ).toBe(false);
    }
  });

  it("描述空白、id 形狀不對、同一場重複的 id 都拒絕", () => {
    const doc = makeDoc(makeScene());
    const sceneId = sceneIdOf(doc);

    expect(
      setSceneExtras(doc, { sceneId, extras: [{ extraId: guests, description: "  ", countValue: exact(3) }] }).ok,
    ).toBe(false);
    expect(
      setSceneExtras(doc, { sceneId, extras: [{ extraId: "ch_1", description: "客人", countValue: exact(3) }] })
        .ok,
    ).toBe(false);
    expect(
      setSceneExtras(doc, {
        sceneId,
        extras: [
          { extraId: guests, description: "客人", countValue: exact(3) },
          { extraId: guests, description: "服務生", countValue: exact(1) },
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
      makeScene({ extras: [{ extraId: guests, description: "咖啡廳客人", countValue: exact(8) }] }),
    );
    const next = unwrap(
      addSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [{ extraId: waiters, description: "服務生", countValue: exact(2) }],
      }),
    );

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([
      read(guests, "咖啡廳客人", exact(8)),
      read(waiters, "服務生", exact(2)),
    ]);
  });

  it("值的把關與 setSceneExtras 是同一套（同一場重複的 id 進不來）", () => {
    const doc = makeDoc(
      makeScene({ extras: [{ extraId: guests, description: "咖啡廳客人", countValue: exact(8) }] }),
    );
    expect(
      addSceneExtras(doc, {
        sceneId: sceneIdOf(doc),
        extras: [{ extraId: guests, description: "客人", countValue: exact(1) }],
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
          { extraId: guests, description: "咖啡廳客人", countValue: exact(8) },
          { extraId: waiters, description: "服務生", countValue: exact(2) },
        ],
      }),
    );
    const next = unwrap(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }));

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([
      read(guests, "咖啡廳客人", exact(8)),
      read(waiters, "服務生", exact(1)),
    ]);
  });

  it("最後一個被拉走 → **整筆消失**，不是留 0 人", () => {
    const doc = makeDoc(
      makeScene({
        extras: [
          { extraId: guests, description: "咖啡廳客人", countValue: exact(8) },
          { extraId: waiters, description: "服務生", countValue: exact(1) },
        ],
      }),
    );
    const next = unwrap(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }));

    // `x0` 不算人數（票券 09 已裁決）—— 0 個群演等於沒有這一筆。
    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([read(guests, "咖啡廳客人", exact(8))]);
  });

  it.each([
    { before: exact(8), after: exact(7) },
    { before: range(3, 5), after: range(2, 4) },
    { before: atLeast(10), after: atLeast(9) },
    { before: some, after: some },
  ])("四種樣子各自減一（票券 46）：$before.kind", ({ before, after }) => {
    const doc = makeDoc(
      makeScene({
        extras: [{ extraId: waiters, description: "服務生", countValue: before }],
      }),
    );
    const next = unwrap(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }));

    expect(sceneExtras(next.child(0).attrs.extras)).toEqual([read(waiters, "服務生", after)]);
  });

  it("**只有確切**走得到「減到 0 就整筆移除」—— 區間／下限／若干那一批還在", () => {
    const survivors: CountValue[] = [range(1, 2), atLeast(1), some];

    for (const countValue of survivors) {
      const doc = makeDoc(
        makeScene({
          extras: [{ extraId: waiters, description: "服務生", countValue }],
        }),
      );
      const next = unwrap(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }));

      // 它們本來就沒有說死有幾個人，拉走一個不會讓那批人消失。
      expect(sceneExtras(next.child(0).attrs.extras)).toHaveLength(1);
    }
  });

  it("別場的群演拉不走 —— 群演是場次限定實體", () => {
    const here = sceneWith([block.dialogue("歡迎光臨")], {
      extras: [{ extraId: guests, description: "咖啡廳客人", countValue: exact(8) }],
    });
    const elsewhere = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: waiters, description: "服務生", countValue: exact(2) }],
    });
    const doc = makeDoc(here, elsewhere);

    const result = takeOneFromExtra(doc, { sceneId: here.attrs.sceneId as string, extraId: waiters });

    expect(result.ok).toBe(false);
    expect(sceneExtras(doc.child(1).attrs.extras)).toHaveLength(1); // 別場那一筆一個字都沒動
  });

  it("找不到場次、找不到那筆群演都拒絕", () => {
    const doc = makeDoc(makeScene({ extras: [{ extraId: guests, description: "客人", countValue: exact(8) }] }));

    expect(takeOneFromExtra(doc, { sceneId: "sc_不存在", extraId: guests }).ok).toBe(false);
    expect(takeOneFromExtra(doc, { sceneId: sceneIdOf(doc), extraId: waiters }).ok).toBe(false);
  });
});

describe("對白的人物欄：合法目標是人物或**本場次的**群演（§5.1）", () => {
  const xiaoming = mintCharacterId();
  const directory = entityDirectory({ characterIds: [xiaoming] });

  it("指向本場群演 → 放行；指向別場的群演 → 拒絕（id 只在該場次內有意義）", () => {
    const here = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: guests, description: "咖啡廳客人", countValue: exact(8) }],
    });
    const elsewhere = sceneWith([block.dialogue("喔——")], {
      extras: [{ extraId: waiters, description: "服務生", countValue: exact(2) }],
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
      extras: [{ extraId: guests, description: "咖啡廳客人", countValue: exact(8) }],
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
