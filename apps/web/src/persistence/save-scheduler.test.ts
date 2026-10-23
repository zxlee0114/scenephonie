import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAVE_MAX_WAIT_MS,
  SAVE_PAUSE_MS,
  SAVE_RETRY_MAX_MS,
  createSaveScheduler,
} from "./save-scheduler";

/**
 * debounce 是「停頓」＋ 上限。寫入放大靠調這兩個數字處理，不改資料模型（§6.7）。
 */
describe("自動存檔的節奏", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("一直打字就不存 —— 是停頓不是節流", async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler({ save });

    for (let elapsed = 0; elapsed < SAVE_PAUSE_MS * 3; elapsed += SAVE_PAUSE_MS - 500) {
      scheduler.changed();
      await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS - 500);
    }

    expect(save).not.toHaveBeenCalled();
  });

  it("停下來滿一次停頓就存一次", async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);

    // 沒有新變更就不會再存 —— 空存檔也是一次整份 doc 覆寫。
    await vi.advanceTimersByTimeAsync(SAVE_MAX_WAIT_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("打不停時，上限逼出一次存檔", async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler({ save });

    for (let elapsed = 0; elapsed < SAVE_MAX_WAIT_MS; elapsed += 1_000) {
      scheduler.changed();
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush 立刻存；沒有待存的變更就什麼都不做", async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler({ save });

    await scheduler.flush();
    expect(save).not.toHaveBeenCalled();

    scheduler.changed();
    await scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);

    // flush 之後停頓計時器不該再補一次。
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("兩次存檔不會同時在路上 —— 後發的會帶著已經過期的 token", async () => {
    let resolveFirst: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("存不進去時維持待存並自己再排一次 —— 使用者停手不打字，那份稿也不會消失", async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockResolvedValue(undefined);
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    // 之後一個字都沒再打。
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(save).toHaveBeenCalledTimes(2);

    // 這次成功了，就不該再重試下去。
    await vi.advanceTimersByTimeAsync(SAVE_MAX_WAIT_MS * 2);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("一直存不進去時，重試間隔逐次加倍，封頂 60 秒後持續再試（票券 65）", async () => {
    const calledAt: number[] = [];
    const save = vi.fn(async () => {
      calledAt.push(Date.now());
      throw new Error("網路斷了");
    });
    const start = Date.now();
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    const gaps = calledAt.map((t, i) => t - (i === 0 ? start : calledAt[i - 1]!));
    expect(gaps).toEqual([2_500, 2_500, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
    scheduler.cancel();
  });

  it("存不進去的期間繼續打字，請求不會變密 —— 照退避的節奏走", async () => {
    const calledAt: number[] = [];
    const save = vi.fn(async () => {
      calledAt.push(Date.now());
      throw new Error("網路斷了");
    });
    const start = Date.now();
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    for (let elapsed = SAVE_PAUSE_MS; elapsed < 2 * 60_000; elapsed += 1_000) {
      scheduler.changed();
      await vi.advanceTimersByTimeAsync(1_000);
    }

    const gaps = calledAt.map((t, i) => t - (i === 0 ? start : calledAt[i - 1]!));
    expect(gaps).toEqual([2_500, 2_500, 5_000, 10_000, 20_000, 40_000]);
    scheduler.cancel();
  });

  it("請求還在路上時打的字，不會在它失敗之後插隊到退避前面", async () => {
    const calledAt: number[] = [];
    // 斷線常見的樣子：不是馬上失敗，是等一陣子才逾時。
    const save = vi.fn(async () => {
      calledAt.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      throw new Error("逾時");
    });
    const start = Date.now();
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS + 500);
    scheduler.changed(); // 現在是 3 秒，第一次還在路上
    // 第一次在 3.5 秒失敗，下一次要等到 3.5 + 2.5 ＝ 6 秒，不是打字那一下起算的 5.5 秒。
    await vi.advanceTimersByTimeAsync(2_999); // 走到 5.999 秒
    expect(calledAt.map((t) => t - start)).toEqual([2_500]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calledAt.map((t) => t - start)).toEqual([2_500, 6_000]);
    scheduler.cancel();
  });

  it("失敗得比一次停頓還慢時，路上打的字也不會讓重試一個接一個連發", async () => {
    const calledAt: number[] = [];
    // 網路很差但沒斷：每次都卡 3 秒才逾時，比一次停頓還久。
    const save = vi.fn(async () => {
      calledAt.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      throw new Error("逾時");
    });
    const start = Date.now();
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(2_600);
    scheduler.changed(); // 第一次還在路上；這一下排的停頓在 5.1 秒到，比它失敗（5.5 秒）還早
    await vi.advanceTimersByTimeAsync(30_000 - 2_600);

    // 每次都在送出 3 秒後失敗，再照退避等：2.5 → 5.5 失敗等 2.5 → 8 → 11 失敗等 5 → 16 → 19 失敗等 10 → 29。
    expect(calledAt.map((t) => t - start)).toEqual([2_500, 8_000, 16_000, 29_000]);
    scheduler.cancel();
  });

  it("兩個 flush 等同一次存檔、而它失敗時，後一個要等到真的落地才回 true", async () => {
    const save = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      throw new Error("網路斷了");
    });
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    const first = scheduler.flush();
    scheduler.changed();
    const second = scheduler.flush(); // 例如網路回來
    const third = scheduler.flush(); // 例如同時按了匯出
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    await expect(third).resolves.toBe(false);
    scheduler.cancel();
  });

  it("報得出下一次重試排在什麼時候 —— 畫面要倒數「x 秒後重試」", async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockResolvedValue(undefined);
    const start = Date.now();
    const scheduler = createSaveScheduler({ save });

    // 還沒失敗過：只是在等停頓，那不是重試。
    scheduler.changed();
    expect(scheduler.nextRetryAt()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2_500); // 第一次失敗
    expect(scheduler.nextRetryAt()).toBe(start + 2_500 + 2_500);

    await vi.advanceTimersByTimeAsync(2_500); // 第二次失敗
    expect(scheduler.nextRetryAt()).toBe(start + 5_000 + 5_000);

    await vi.advanceTimersByTimeAsync(5_000); // 存進去了
    expect(scheduler.nextRetryAt()).toBeUndefined();
  });

  it("報得出手上還有沒有沒落地的變更 —— 關分頁前要問這一句", async () => {
    let settle: ((ok: boolean) => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = (ok) => (ok ? resolve() : reject(new Error("網路斷了")));
        }),
    );
    const scheduler = createSaveScheduler({ save });
    expect(scheduler.hasPending()).toBe(false);

    scheduler.changed();
    expect(scheduler.hasPending()).toBe(true); // 還在等停頓

    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(scheduler.hasPending()).toBe(true); // 送出去了，但還沒落地

    settle?.(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.hasPending()).toBe(true); // 存不進去，等重試

    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    settle?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.hasPending()).toBe(false);
  });

  it("cancel 時還在路上的那一次失敗了，也不會再排重試", async () => {
    const save = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      throw new Error("網路斷了");
    });
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    scheduler.cancel(); // 元件卸載，第一次還在路上
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MAX_MS * 3);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush 不受退避限制 —— 匯出 PDF、網路回來時要立刻試一次", async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockResolvedValue(undefined);
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(2_500 + 2_500 + 5_000);
    expect(save).toHaveBeenCalledTimes(3); // 下一次重試排在 10 秒後

    await expect(scheduler.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(4);

    // 存進去了，那個 10 秒後的重試也跟著撤掉。
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MAX_MS * 2);
    expect(save).toHaveBeenCalledTimes(4);
  });

  it("存進去一次，退避就歸零 —— 下次斷線從頭起算", async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockRejectedValueOnce(new Error("網路斷了"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("又斷了"))
      .mockResolvedValue(undefined);
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(2_500 + 2_500 + 5_000 + 10_000);
    expect(save).toHaveBeenCalledTimes(4); // 第四次存進去了

    scheduler.changed();
    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(save).toHaveBeenCalledTimes(5); // 又斷了

    await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
    expect(save).toHaveBeenCalledTimes(6); // 隔一次停頓就再試，不是接著上一輪的 20 秒
  });

  it("存檔失敗不會讓 flush 炸到呼叫端 —— 排程繼續轉", async () => {
    const save = vi.fn(async () => {
      throw new Error("伺服器 500");
    });
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await expect(scheduler.flush()).resolves.toBe(false);
    scheduler.cancel();
  });

  it("flush 回報手上的是不是都落地了 —— 匯出 PDF 要先知道這件事（票券 18）", async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler({ save });

    await expect(scheduler.flush()).resolves.toBe(true); // 本來就沒有待存的
    scheduler.changed();
    await expect(scheduler.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancel 之後不再存", async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(SAVE_MAX_WAIT_MS * 2);

    expect(save).not.toHaveBeenCalled();
  });
});
