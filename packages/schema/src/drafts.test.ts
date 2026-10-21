/**
 * 草稿場次（票券 14，§4.8）—— 推導值，從 `projectScenes` 這一次走訪出來：`draft` 旗標與
 * `S11[D1]` 標籤。三條自動草稿不變式全部接到「metadata 不完整」，這裡各有一條測試。
 */
import { describe, expect, it } from "vitest";

import { mintCharacterId } from "./entities";
import { projectScenes } from "./project-scenes";
import {
  block,
  filled,
  fragmentOf,
  groupWith,
  makeDoc,
  memberWith,
  sceneWith,
  subsceneWith,
} from "./testing";

/** 一場在推導裡的樣子：標籤與是不是草稿。 */
const shape = (doc: ReturnType<typeof makeDoc>) =>
  projectScenes(doc).map(({ label, draft }) => ({ label, draft }));
const labels = (doc: ReturnType<typeof makeDoc>) => projectScenes(doc).map((s) => s.label);
const draftOf = (doc: ReturnType<typeof makeDoc>, scene: { attrs: Record<string, unknown> }) =>
  projectScenes(doc).find((s) => s.sceneId === scene.attrs.sceneId)!.draft;

const scene = (attrs: Record<string, unknown> = filled(), text = "走進房間") =>
  sceneWith([block.action(text)], attrs);
const sub = (attrs: Record<string, unknown> = filled()) =>
  subsceneWith([block.action("陽台")], { kind: "接續", ...attrs });

describe("是草稿 = manualDraft 或 metadata 不完整", () => {
  it("metadata 有空欄的場次是草稿；填完它自己就是正式場次", () => {
    const doc = makeDoc(scene(filled({ time: null })));
    expect(projectScenes(doc)[0]!.draft).toBe(true);

    const done = makeDoc(scene(filled()));
    expect(shape(done)).toEqual([{ label: "1", draft: false }]);
  });

  it("時間、內外、地點任何一欄空著都算不完整", () => {
    for (const empty of [{ time: null }, { intExt: null }, { location: null }, { location: [] }]) {
      expect(projectScenes(makeDoc(scene(filled(empty))))[0]!.draft).toBe(true);
    }
  });

  it("登場人物不參與判定 —— 沒有人入鏡的空景照樣是正式場次（使用者裁決 2026-10-21）", () => {
    const doc = makeDoc(scene(filled({ appearingCharacters: null })));
    expect(projectScenes(doc)[0]!.draft).toBe(false);
  });

  it("內外＝雜景 ＋ 地點留空：不算草稿；雜景的其他欄照樣要填", () => {
    expect(projectScenes(makeDoc(scene(filled({ intExt: "雜景", location: null }))))[0]!.draft).toBe(false);
    expect(projectScenes(makeDoc(scene(filled({ intExt: "雜景", location: [] }))))[0]!.draft).toBe(false);
    expect(
      projectScenes(makeDoc(scene(filled({ intExt: "雜景", location: null, time: null }))))[0]!.draft,
    ).toBe(true);
  });

  it("手動標記為草稿：metadata 填完了也是草稿", () => {
    const doc = makeDoc(scene(filled({ manualDraft: true })));
    expect(projectScenes(doc)[0]!.draft).toBe(true);
  });

  it("推導不寫 doc —— 沒有任何時刻有東西在編劇背後改他的文件", () => {
    const doc = makeDoc(scene(filled({ time: null })), scene());
    const before = doc.toJSON();
    projectScenes(doc);
    expect(doc.toJSON()).toEqual(before);
  });
});

describe("草稿標籤：不佔正式場次號，錨定前一個正式場次", () => {
  it("草稿跳號：後面的正式場次接著前一個正式場次編", () => {
    const doc = makeDoc(scene(), scene(filled({ time: null })), scene());
    expect(shape(doc)).toEqual([
      { label: "1", draft: false },
      { label: "S1[D1]", draft: true },
      { label: "2", draft: false },
    ]);
  });

  it("連續的草稿錨定同一場、依序編 D1、D2；遇到下一個正式場次重新起算", () => {
    const draft = () => scene(filled({ manualDraft: true }));
    const doc = makeDoc(scene(), draft(), draft(), scene(), draft());
    expect(labels(doc)).toEqual(["1", "S1[D1]", "S1[D2]", "2", "S2[D1]"]);
  });

  it("排在全劇第一場之前的草稿是 [D1]", () => {
    const empty = () => scene({});
    expect(labels(makeDoc(empty(), empty(), scene()))).toEqual(["[D1]", "[D2]", "1"]);
  });

  it("草稿子場次錨定前一個正式子場次（S5.1[D1]），它後面的正式子場次不跳號", () => {
    const parent = sceneWith(
      [block.action("客廳"), sub(), block.action("a"), sub({ time: null }), block.action("b"), sub()],
      filled(),
    );
    expect(labels(makeDoc(parent))).toEqual(["1", "1.1", "S1.1[D1]", "1.2"]);
  });
});

describe("不變式 ②：子場次的 metadata 與主場次完全相同 → 草稿", () => {
  it("與主場次完全相同的子場次是草稿；差一欄就不是", () => {
    const meta = filled({ appearingCharacters: [{ characterId: mintCharacterId(), displayName: "若晴" }] });
    const echo = sub(meta);
    const differs = sub({ ...meta, time: "夜" });
    const doc = makeDoc(sceneWith([block.action("客廳"), echo, block.action("a"), differs], meta));
    expect(draftOf(doc, echo)).toBe(true);
    expect(draftOf(doc, differs)).toBe(false);
  });

  it("父場次是草稿 → 子場次一律是草稿；子場次可以單獨是草稿而父場次不是", () => {
    const child = sub();
    const draftParent = makeDoc(sceneWith([block.action("客廳"), child], filled({ manualDraft: true })));
    expect(shape(draftParent)).toEqual([
      { label: "[D1]", draft: true },
      { label: "[D2]", draft: true },
    ]);

    const lone = sub({ intExt: null });
    const formalParent = makeDoc(sceneWith([block.action("客廳"), lone], filled()));
    expect(shape(formalParent)).toEqual([
      { label: "1", draft: false },
      { label: "S1[D1]", draft: true },
    ]);
  });
});

describe("不變式 ③：同一群組的成員之間 metadata 完全相同 → 草稿", () => {
  const group = (a: ReturnType<typeof memberWith>, b: ReturnType<typeof memberWith>) =>
    makeDoc(groupWith([a, b], [fragmentOf(a, [block.action("A")]), fragmentOf(b, [block.action("B")])]));

  it("metadata 完全相同的兩個成員都是草稿", () => {
    const meta = filled();
    const a = memberWith(meta);
    const b = memberWith(meta);
    expect(shape(group(a, b))).toEqual([
      { label: "[D1]", draft: true },
      { label: "[D2]", draft: true },
    ]);
  });

  it("同地點、同時間（其他欄不同）也算 —— ③ 的寬鬆版（票券 12 驗收）", () => {
    const place = filled().location;
    const a = memberWith(filled({ location: place, intExt: "內景" }));
    const b = memberWith(filled({ location: place, intExt: "外景" }));
    expect(projectScenes(group(a, b)).map((s) => s.draft)).toEqual([true, true]);
  });

  it("時空不同的成員各自是正式場次", () => {
    const a = memberWith(filled());
    const b = memberWith(filled({ time: "夜" }));
    expect(shape(group(a, b))).toEqual([
      { label: "1", draft: false },
      { label: "2", draft: false },
    ]);
  });

  it("成員是草稿 → 它片段裡的子場次一律是草稿", () => {
    const a = memberWith(filled({ manualDraft: true }));
    const b = memberWith(filled());
    const inner = sub();
    const doc = makeDoc(
      groupWith([a, b], [fragmentOf(a, [block.action("A"), inner]), fragmentOf(b, [block.action("B")])]),
    );
    expect(draftOf(doc, inner)).toBe(true);
  });
});
