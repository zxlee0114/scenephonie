import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAVE_MAX_WAIT_MS, SAVE_PAUSE_MS, createSaveScheduler } from "./save-scheduler";

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

  it("存檔失敗不會讓 flush 炸到呼叫端 —— 排程繼續轉", async () => {
    const save = vi.fn(async () => {
      throw new Error("伺服器 500");
    });
    const scheduler = createSaveScheduler({ save });

    scheduler.changed();
    await expect(scheduler.flush()).resolves.toBeUndefined();
    scheduler.cancel();
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
