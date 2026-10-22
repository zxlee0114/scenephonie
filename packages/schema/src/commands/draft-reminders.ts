/**
 * 匯出前清單的「之後不再提醒勾選的場次」（票券 19，§9.6）。
 *
 * 記在場次的 `draftReminderDismissed` 上 —— 「不再提醒」記的必須是 `sceneId`，標籤只負責讓人在
 * 清單裡看懂是哪一場（拖一下 `S11[D1]` 就變成 `S3[D2]`）。它只讓清單不再列那一場：那一場照樣是草稿、
 * 照樣不印，匯出完成後那一行「本次略過 N 場草稿」照樣算它。
 *
 * 多選是一次寫入：一個 transaction，⌘Z 一步撤回整批。有一個 `sceneId` 找不到就整批拒絕 —— 記一半
 * 的話，編劇勾的跟系統記的就對不上了。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { type CommandResult, ok, reject } from "./result";
import { findScene, replaceScene } from "./tree";

export interface DismissDraftRemindersOptions {
  /** 勾選的場次（主場次、子場次或群組成員）。 */
  readonly sceneIds: readonly string[];
}

export function dismissDraftReminders(
  doc: ProseMirrorNode,
  options: DismissDraftRemindersOptions,
): CommandResult {
  let next = doc;
  for (const sceneId of options.sceneIds) {
    const hit = findScene(next, sceneId);
    if (!hit) return reject(`找不到 sceneId「${sceneId}」`);
    if (hit.node.attrs.draftReminderDismissed === true) continue;
    const scene = hit.node.type.create({ ...hit.node.attrs, draftReminderDismissed: true }, hit.node.content, hit.node.marks);
    try {
      next = replaceScene(next, hit, scene);
    } catch (err) {
      return reject(`記錄不再提醒後 doc 不符 schema：${(err as Error).message}`);
    }
  }
  return ok(next);
}
