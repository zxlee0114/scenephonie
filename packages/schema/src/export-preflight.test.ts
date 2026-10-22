/**
 * 匯出前防呆（票券 19，§9.6）—— 「這份 PDF 會少掉這幾場」。
 *
 * `exportPreflight(doc)` 回答兩件事，兩件分開：
 *
 * 1. **會被略過的草稿**：每筆帶標籤（`S1[D1]`）、內容首行（標籤對編劇是個空號，首行才是他認得的）、
 *    為什麼是草稿；草稿成員讓整個群組印不出來，那一筆要說出後果。「不再提醒」過的不列，但照樣算進
 *    「本次略過 N 場」。
 * 2. **登場人物提示**：有一般發聲的對白、卻不在登場人物欄的人 —— 提醒不阻擋，只看會印出來的場次。
 */
import { describe, expect, it } from "vitest";

import { mintCharacterId } from "./entities";
import { exportPreflight } from "./export-preflight";
import { block, filled, fragmentOf, groupWith, makeDoc, memberWith, sceneWith, subsceneWith } from "./testing";

const scene = (blocks = [block.action("走進房間")], attrs: Record<string, unknown> = filled()) =>
  sceneWith(blocks, attrs);

describe("exportPreflight：會被略過的草稿", () => {
  it("沒填完 metadata 的一場：標籤、首行摘錄、缺了哪幾欄", () => {
    const one = scene();
    const draft = scene([block.action("小明在雨中奔跑")], { time: "夜" });

    const { drafts, skipped } = exportPreflight(makeDoc(one, draft));

    expect(drafts).toEqual([
      {
        sceneId: draft.attrs.sceneId,
        label: "S1[D1]",
        excerpt: "小明在雨中奔跑",
        reasons: [{ kind: "missingMeta", fields: ["intExt", "location"] }],
      },
    ]);
    expect(skipped).toEqual({ drafts: 1, groupMates: 0 });
  });
});

describe("exportPreflight：不再提醒", () => {
  it("「不再提醒」過的不列進清單，但照樣算進這次略過的場數", () => {
    const quiet = scene([block.action("留著備用")], { ...filled(), manualDraft: true, draftReminderDismissed: true });
    const loud = scene([block.action("還沒寫完")], { manualDraft: true });

    const { drafts, skipped } = exportPreflight(makeDoc(quiet, loud));

    expect(drafts.map((d) => d.sceneId)).toEqual([loud.attrs.sceneId]);
    expect(skipped).toEqual({ drafts: 2, groupMates: 0 });
  });
});

describe("exportPreflight：首行摘錄", () => {
  const excerpt = (blocks: ReturnType<typeof block.action>[]) =>
    exportPreflight(makeDoc(scene(blocks, { manualDraft: true }))).drafts[0]!.excerpt;

  it("跳過空區塊；軟換行之後的不算第一行", () => {
    expect(excerpt([block.action(""), block.action("  "), block.action("雨停了\n街上沒有人")])).toBe("雨停了");
  });

  it("對白照紙上的樣子：說話者、全形冒號、台詞", () => {
    const speaker = { id: mintCharacterId(), displayName: "小明" };
    expect(excerpt([block.dialogue("你來了", { character: speaker })])).toBe("小明：你來了");
  });

  it("超過二十個字以「……」收尾", () => {
    expect(excerpt([block.action("一二三四五六七八九十一二三四五六七八九十一二")])).toBe(
      "一二三四五六七八九十一二三四五六七八九十……",
    );
  });

  it("沒有內文是空字串", () => {
    expect(excerpt([block.action("")])).toBe("");
  });
});

describe("exportPreflight：對剪群組", () => {
  it("草稿成員讓整組印不出來：那一筆說出同組還有誰一起被略過，摘錄取自它的片段", () => {
    const before = scene();
    const ready = memberWith(filled());
    const draft = memberWith(filled({ time: null }));
    const readySub = subsceneWith([block.action("回憶")], { ...filled(), kind: "插入" });
    const group = groupWith(
      [ready, draft],
      [fragmentOf(ready, [block.action("他撥了電話"), readySub]), fragmentOf(draft, [block.action("她接起電話")])],
    );

    const { drafts, skipped } = exportPreflight(makeDoc(before, group));

    expect(drafts).toEqual([
      {
        sceneId: draft.attrs.sceneId,
        label: "S2[D1]",
        excerpt: "她接起電話",
        reasons: [{ kind: "missingMeta", fields: ["time"] }],
        group: { groupMates: ["2", "2.1"] },
      },
    ]);
    expect(skipped).toEqual({ drafts: 1, groupMates: 2 });
  });
});

describe("exportPreflight：子場次", () => {
  it("主場次是草稿，子場次連帶；與主場次 metadata 相同也是草稿", () => {
    const parentMeta = filled();
    const echo = subsceneWith([block.action("同一個地方")], { ...parentMeta, kind: "接續" });
    const parent = scene([block.action("開場"), echo], parentMeta);
    const draftParentSub = subsceneWith([block.action("閃回")], { ...filled(), kind: "插入" });
    const draftParent = scene([block.action("另一場"), draftParentSub], { ...filled(), manualDraft: true });

    const { drafts } = exportPreflight(makeDoc(parent, draftParent));

    expect(drafts.map(({ label, reasons }) => ({ label, reasons }))).toEqual([
      { label: "S1[D1]", reasons: [{ kind: "echoesParent" }] },
      { label: "S1[D2]", reasons: [{ kind: "manual" }] },
      { label: "S1[D3]", reasons: [{ kind: "parentDraft" }] },
    ]);
  });
});

describe("exportPreflight：登場人物提示（另列，提醒不阻擋）", () => {
  const person = (displayName: string) => ({ id: mintCharacterId(), displayName });
  const says = (who: { id: string; displayName: string }, voiceStyle = "一般") =>
    block.dialogue("嗯", { character: who, voiceStyle });

  it("一般發聲、不在登場人物欄的人；V.O.、已列入、選過「不新增」的都不提", () => {
    const [ming, hua, voice, gone] = [person("小明"), person("小華"), person("旁白"), person("阿強")];
    const s = scene([says(ming), says(ming), says(hua), says(voice, "V.O."), says(gone)], {
      ...filled(),
      appearingCharacters: [{ characterId: hua.id, displayName: "小華" }],
      dismissedCharacterIds: [gone.id],
    });

    expect(exportPreflight(makeDoc(s)).appearing).toEqual([
      { sceneId: s.attrs.sceneId, label: "1", speakers: ["小明"] },
    ]);
  });

  it("只看會印出來的場次：草稿不提；子場次與群組成員的片段各算各的", () => {
    const ming = person("小明");
    const sub = subsceneWith([says(ming)], { ...filled(), kind: "插入" });
    const s = scene([block.action("開場"), sub]);
    const draft = scene([says(ming)], { manualDraft: true });
    const [a, b] = [memberWith(filled()), memberWith(filled())];
    const group = groupWith([a, b], [fragmentOf(a, [block.action("撥電話")]), fragmentOf(b, [says(ming)])]);

    const { appearing } = exportPreflight(makeDoc(s, draft, group));

    expect(appearing.map(({ label, speakers }) => ({ label, speakers }))).toEqual([
      { label: "1.1", speakers: ["小明"] },
      { label: "3", speakers: ["小明"] },
    ]);
  });
});
