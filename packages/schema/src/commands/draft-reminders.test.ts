import { describe, expect, it } from "vitest";

import { exportPreflight } from "../export-preflight";
import { block, fragmentOf, groupWith, makeDoc, memberWith, sceneWith, subsceneWith } from "../testing";
import { dismissDraftReminders } from "./draft-reminders";

const draft = (text: string) => sceneWith([block.action(text)], { manualDraft: true });

describe("dismissDraftReminders：匯出前清單的「之後不再提醒」（票券 19）", () => {
  it("勾了幾場就記幾場（以 sceneId 定址），清單不再列它們；沒勾的照列", () => {
    const [a, b, c] = [draft("一"), draft("二"), draft("三")];
    const result = dismissDraftReminders(makeDoc(a, b, c), {
      sceneIds: [a.attrs.sceneId as string, c.attrs.sceneId as string],
    });
    if (!result.ok) throw new Error(result.reason);

    expect(exportPreflight(result.value).drafts.map((d) => d.sceneId)).toEqual([b.attrs.sceneId]);
    expect(result.value.child(0).attrs).toMatchObject({ manualDraft: true, draftReminderDismissed: true });
  });

  it("子場次與群組成員也記得住", () => {
    const sub = subsceneWith([block.action("閃回")], { kind: "插入", manualDraft: true });
    const member = memberWith({ manualDraft: true });
    const other = memberWith();
    const doc = makeDoc(
      sceneWith([block.action("客廳"), sub]),
      groupWith([member, other], [fragmentOf(member, [block.action("撥電話")])]),
    );
    const result = dismissDraftReminders(doc, {
      sceneIds: [sub.attrs.sceneId as string, member.attrs.sceneId as string],
    });
    if (!result.ok) throw new Error(result.reason);

    expect(exportPreflight(result.value).drafts.map((d) => d.sceneId)).not.toContain(sub.attrs.sceneId);
    expect(exportPreflight(result.value).drafts.map((d) => d.sceneId)).not.toContain(member.attrs.sceneId);
  });

  it("有一個 sceneId 找不到就整批拒絕，不記一半", () => {
    const a = draft("一");
    expect(dismissDraftReminders(makeDoc(a), { sceneIds: [a.attrs.sceneId as string, "sc_nope"] }).ok).toBe(false);
  });
});
