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
 *
 * `save` 失敗（reject）＝那份變更還沒落地，於是它維持待存並自己排下一次；`flush()` 本身
 * 不會因此 reject —— 呼叫端要的是「排程繼續轉」，不是一個要接的例外。
 *
 * 重試走**退避**而不是打字的節奏（票券 65）：從一次停頓起跳、逐次加倍、封頂 `retryMaxMs`，
 * 之後永遠照封頂值再試 —— 不設次數上限，因為停手就等於畫面說「會再試一次」卻再也不試。
 * 等重試的期間打的字搭下一次重試的車，不讓請求變密。`flush()` 是呼叫端主動要的（匯出、
 * 離開分頁、網路回來），不受退避限制。存進去一次，退避就歸零。
 */

/** 打字停多久算一次停頓。 */
export const SAVE_PAUSE_MS = 2_500;

/** 一直打字時，最多隔多久一定存一次。 */
export const SAVE_MAX_WAIT_MS = 15_000;

/** 存不進去時，重試間隔加倍到這裡就不再拉長（票券 65）。 */
export const SAVE_RETRY_MAX_MS = 60_000;

export type SaveScheduler = {
  /** doc 變了。重新起算停頓；強制上限從「上次存完後的第一次變更」起算。 */
  changed(): void;
  /**
   * 立刻存（分頁要隱藏／關閉時、匯出之前）。沒有待存的變更就什麼都不做。
   * 回傳 `true` ＝ 手上的變更都落地了；`false` ＝ 這一次沒存進去（仍然待存，排程會再試）。
   */
  flush(): Promise<boolean>;
  /** 丟掉待存的計時器（元件卸載）。不取消已經在路上的那一次。 */
  cancel(): void;
  /**
   * 存不進去、正在等重試時，下一次排在什麼時候（epoch ms）；沒有在等重試就是 `undefined`。
   * 畫面拿它倒數「x 秒後重試」—— 說「會再試」就要說得出什麼時候（票券 65）。
   */
  nextRetryAt(): number | undefined;
  /** 手上還有沒落地的變更：還在等著存、正在路上、或存不進去在等重試。關分頁前要問這一句。 */
  hasPending(): boolean;
};

export function createSaveScheduler({
  save,
  pauseMs = SAVE_PAUSE_MS,
  maxWaitMs = SAVE_MAX_WAIT_MS,
  retryMaxMs = SAVE_RETRY_MAX_MS,
}: {
  save: () => Promise<void>;
  pauseMs?: number;
  maxWaitMs?: number;
  retryMaxMs?: number;
}): SaveScheduler {
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let inFlight: Promise<void> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAt: number | undefined;
  /** 連續失敗幾次了。存成功一次就歸零。 */
  let failures = 0;
  /** `cancel()` 過了：路上那一次落地之後也不再排任何計時器。 */
  let cancelled = false;
  /** 有計時器在請求還在路上時到點了 —— 那一次成功的話就該緊接著補存。 */
  let dueWhileInFlight = false;

  /** 第 n 次連續失敗後隔多久再試：從一次停頓起跳、逐次加倍、封頂 `retryMaxMs`。 */
  function retryDelay(n: number): number {
    return Math.min(pauseMs * 2 ** (n - 1), retryMaxMs);
  }

  function clearTimers(): void {
    if (pauseTimer !== undefined) clearTimeout(pauseTimer);
    if (maxTimer !== undefined) clearTimeout(maxTimer);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    pauseTimer = undefined;
    maxTimer = undefined;
    retryTimer = undefined;
    retryAt = undefined;
  }

  /** 起算停頓；強制上限已經在跑的話不重設，否則一直打字就一直沒有上限。 */
  function arm(): void {
    if (pauseTimer !== undefined) clearTimeout(pauseTimer);
    pauseTimer = setTimeout(onTimer, pauseMs);
    if (maxTimer === undefined) maxTimer = setTimeout(onTimer, maxWaitMs);
  }

  /**
   * 停頓、上限、重試任一個到點。前一次還在路上就**不排在它後面**，只記下「到點了」，
   * 由它落地的結果決定：成功 → 緊接著補存；失敗 → 交給退避。排在後面的話，它一失敗這裡
   * 就緊接著再送，失敗得比一次停頓還慢時（網路很差但沒斷）就變成一個接一個連發。
   */
  function onTimer(): void {
    clearTimers();
    if (inFlight) {
      dueWhileInFlight = true;
      return;
    }
    void send();
  }

  function send(): Promise<void> {
    dirty = false;
    dueWhileInFlight = false;
    inFlight = save()
      .then(() => {
        failures = 0;
      })
      .catch(() => {
        // 存不進去（斷網、伺服器 500）—— 這份變更**還沒落地**，所以它仍然是 dirty，
        // 而且要自己排下一次。少了這一段，使用者存檔失敗後只要停手不打字，
        // 那份修改就永遠不會再被寫出去，而畫面還說「會再試一次」。
        dirty = true;
        failures += 1;
        dueWhileInFlight = false;
        // 請求在路上時打的字排了停頓計時器；失敗之後由退避接手，那些不能插隊。
        clearTimers();
        if (!cancelled) {
          const delay = retryDelay(failures);
          retryAt = Date.now() + delay;
          retryTimer = setTimeout(onTimer, delay);
        }
      })
      .finally(() => {
        inFlight = undefined;
        // 只有成功會走到這裡還留著 `dueWhileInFlight`（失敗那條已經交給退避、把它放下了）。
        // 放在 `inFlight` 清掉之後才補送，新的那一次才不會被這裡蓋掉。
        if (dueWhileInFlight && dirty && !cancelled) void send();
      });
    return inFlight;
  }

  async function flush(): Promise<boolean> {
    clearTimers();
    // 前一次存檔還在路上 —— 排在它後面，永遠不讓兩次存檔同時飛（後發的 token 會是舊的）。
    // 用 while：同時有好幾個 flush 在等時，前一個醒來可能已經送出下一次，要等到路上真的沒有。
    while (inFlight) await inFlight;
    if (!dirty) return true;
    clearTimers(); // 剛落地那一次排的停頓或重試 —— 這裡就要送了
    await send();
    // 它成功時可能緊接著補存了路上打的字（見 `dueWhileInFlight`），那一次也要落地才算數。
    while (inFlight) await inFlight;
    return !dirty;
  }

  return {
    changed(): void {
      dirty = true;
      // 正在等重試 —— 新打的字搭下一次重試的車，不另排停頓。否則斷線期間一直打字，
      // 就會照打字的節奏每 2.5 秒打一次，退避形同虛設。
      if (retryTimer !== undefined) return;
      arm();
    },
    flush,
    cancel(): void {
      cancelled = true;
      clearTimers();
    },
    nextRetryAt(): number | undefined {
      return retryAt;
    },
    hasPending(): boolean {
      // 路上那一次送出時就把 dirty 放下了，但它還沒落地 —— 這時關分頁一樣會丟稿。
      return dirty || inFlight !== undefined;
    },
  };
}
