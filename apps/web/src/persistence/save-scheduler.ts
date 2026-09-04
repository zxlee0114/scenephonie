/**
 * 自動存檔的節奏（§6.7 寫入放大）。
 *
 * 每次存檔重寫整份 doc（幾百 KB，走 TOAST ＋ WAL）。v1 不是問題（單人、單劇本、寫作是低併發
 * 活動），處理方式是**調 debounce 而不是改資料模型** —— 真痛了那天的解法是傳 Step 而不是傳
 * 整份 doc，仍然不動儲存粒度。
 *
 * 用「停頓」而非「節流」：打字停 `pauseMs` 才存，另加一個 `maxWaitMs` 的強制上限，
 * 免得一直打字就一直不存。這個模組不知道 doc 是什麼、也不碰網路 —— 它只決定「何時該存」，
 * 存什麼由 `save` callback 自己去讀當下的狀態。
 */

/** 打字停多久算一次停頓。 */
export const SAVE_PAUSE_MS = 2_500;

/** 一直打字時，最多隔多久一定存一次。 */
export const SAVE_MAX_WAIT_MS = 15_000;

export type SaveScheduler = {
  /** doc 變了。重新起算停頓；強制上限從「上次存完後的第一次變更」起算。 */
  changed(): void;
  /** 立刻存（分頁要隱藏／關閉時）。沒有待存的變更就什麼都不做。 */
  flush(): Promise<void>;
  /** 丟掉待存的計時器（元件卸載）。不取消已經在路上的那一次。 */
  cancel(): void;
};

export function createSaveScheduler({
  save,
  pauseMs = SAVE_PAUSE_MS,
  maxWaitMs = SAVE_MAX_WAIT_MS,
}: {
  save: () => Promise<void>;
  pauseMs?: number;
  maxWaitMs?: number;
}): SaveScheduler {
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let inFlight: Promise<void> | undefined;

  function clearTimers(): void {
    if (pauseTimer !== undefined) clearTimeout(pauseTimer);
    if (maxTimer !== undefined) clearTimeout(maxTimer);
    pauseTimer = undefined;
    maxTimer = undefined;
  }

  async function flush(): Promise<void> {
    clearTimers();
    // 前一次存檔還在路上 —— 排在它後面，永遠不讓兩次存檔同時飛（後發的 token 會是舊的）。
    if (inFlight) await inFlight;
    if (!dirty) return;
    dirty = false;
    inFlight = save().finally(() => {
      inFlight = undefined;
    });
    await inFlight;
  }

  return {
    changed(): void {
      dirty = true;
      if (pauseTimer !== undefined) clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => void flush(), pauseMs);
      if (maxTimer === undefined) maxTimer = setTimeout(() => void flush(), maxWaitMs);
    },
    flush,
    cancel(): void {
      clearTimers();
    },
  };
}
