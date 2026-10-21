/**
 * 場次群組的推導值（票券 12）：成員的頂層場次號、不變式 ③ 的判準。
 */
import { describe, expect, it } from "vitest";

import { echoingMembers } from "./groups";
import { projectScenes } from "./project-scenes";
import {
  block,
  fragmentOf,
  groupWith,
  makeDoc,
  makeScene,
  memberWith,
  subsceneWith,
} from "./testing";

describe("projectScenes：成員各佔頂層場次號，群組不佔號", () => {
  it("25 → 群組（26／27）→ 28；子場次編在它的成員底下", () => {
    const before = makeScene();
    const a = memberWith();
    const b = memberWith();
    const sub = subsceneWith([block.action("閃回")], { kind: "插入" });
    const group = groupWith(
      [a, b],
      [
        fragmentOf(a, [block.action("偵訊室")]),
        fragmentOf(b, [block.action("倉庫"), sub]),
        fragmentOf(a, [block.action("回偵訊室")]),
      ],
    );
    const after = makeScene();

    const labels = projectScenes(makeDoc(before, group, after)).map((s) => [s.sceneId, s.label]);
    expect(labels).toEqual([
      [before.attrs.sceneId, "1"],
      [a.attrs.sceneId, "2"],
      [b.attrs.sceneId, "3"],
      [sub.attrs.sceneId, "3.1"],
      [after.attrs.sceneId, "4"],
    ]);
  });
});

describe("不變式 ③：同一群組的成員之間，metadata 不得完全相同", () => {
  it("時空完全相同的成員被認出來；差一欄就不算", () => {
    const loc = { locationId: "lo_x", displayName: "警局" };
    const a = memberWith({ time: "夜", intExt: "內景", location: loc });
    const b = memberWith({ time: "夜", intExt: "內景", location: { ...loc, displayName: "偵訊室" } });
    const c = memberWith({ time: "日", intExt: "內景", location: loc });
    const group = groupWith([a, b, c], [fragmentOf(a, [block.action("x")])]);

    expect(echoingMembers(group)).toEqual([a.attrs.sceneId, b.attrs.sceneId]);
  });

  it("兩個都還空著的成員也算相同 —— 它們本來就是草稿", () => {
    const a = memberWith();
    const b = memberWith();
    expect(echoingMembers(groupWith([a, b], [fragmentOf(a, [block.action("x")])]))).toHaveLength(2);
  });
});
