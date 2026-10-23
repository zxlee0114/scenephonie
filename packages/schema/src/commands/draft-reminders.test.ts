import { describe, expect, it } from "vitest";

import { exportPreflight } from "../export-preflight";
import { block, fragmentOf, groupWith, makeDoc, memberWith, sceneWith, subsceneWith } from "../testing";
import { setDraftReminderDismissed } from "./draft-reminders";

const draft = (text: string) => sceneWith([block.action(text)], { manualDraft: true });
const dismissedIds = (doc: Parameters<typeof exportPreflight>[0]) =>
  exportPreflight(doc)
    .drafts.filter((d) => d.dismissed)
    .map((d) => d.sceneId);

describe("setDraftReminderDismissed：匯出前清單的「之後不再提醒」與「恢復提醒」（票券 19）", () => {
  it("勾了幾場就記幾場（以 sceneId 定址）；沒勾的照樣提醒", () => {
    const [a, b, c] = [draft("一"), draft("二"), draft("三")];
    const result = setDraftReminderDismissed(makeDoc(a, b, c), {
      sceneIds: [a.attrs.sceneId as string, c.attrs.sceneId as string],
      dismissed: true,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(dismissedIds(result.value)).toEqual([a.attrs.sceneId, c.attrs.sceneId]);
    expect(result.value.child(0).attrs).toMatchObject({ manualDraft: true, draftReminderDismissed: true });
  });

  it("恢復提醒：記過的那幾場回到要提醒的清單", () => {
    const [a, b] = [draft("一"), draft("二")];
    const sceneIds = [a.attrs.sceneId as string, b.attrs.sceneId as string];
    const quiet = setDraftReminderDismissed(makeDoc(a, b), { sceneIds, dismissed: true });
    if (!quiet.ok) throw new Error(quiet.reason);

    const result = setDraftReminderDismissed(quiet.value, { sceneIds: [sceneIds[1]!], dismissed: false });
    if (!result.ok) throw new Error(result.reason);

    expect(dismissedIds(result.value)).toEqual([a.attrs.sceneId]);
  });

  it("子場次與群組成員也記得住", () => {
    const sub = subsceneWith([block.action("閃回")], { kind: "插入", manualDraft: true });
    const member = memberWith({ manualDraft: true });
    const other = memberWith();
    const doc = makeDoc(
      sceneWith([block.action("客廳"), sub]),
      groupWith([member, other], [fragmentOf(member, [block.action("撥電話")])]),
    );
    const result = setDraftReminderDismissed(doc, {
      sceneIds: [sub.attrs.sceneId as string, member.attrs.sceneId as string],
      dismissed: true,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(dismissedIds(result.value)).toEqual(expect.arrayContaining([sub.attrs.sceneId, member.attrs.sceneId]));
  });

  it("有一個 sceneId 找不到就整批拒絕，不記一半", () => {
    const a = draft("一");
    expect(
      setDraftReminderDismissed(makeDoc(a), { sceneIds: [a.attrs.sceneId as string, "sc_nope"], dismissed: true }).ok,
    ).toBe(false);
  });
});
