import type { Node as ProseMirrorNode } from "prosemirror-model";

import { type CommandResult, ok, reject } from "./result";

/**
 * 建出搬移後的 doc 並**整份驗內容規則**。`type.create` 不驗內容（`createChecked` 才驗），
 * 而搬移 command 的全部價值就在於拒絕非法目標 —— 漏網的那一個必須在這裡被攔下，不能流進編輯器。
 */
export function checked(build: () => ProseMirrorNode): CommandResult {
  try {
    const next = build();
    next.check();
    return ok(next);
  } catch (err) {
    return reject(`搬移後 doc 不符 schema：${(err as Error).message}`);
  }
}
